import { hashOf } from './canonical.ts';
import { distributionId, emissionUnits, epochWindow, fromUnits, startRippleTime, type Manifest } from './manifest.ts';
import { ledgerCurrency, type LedgerHeader, type Rpc } from './rpc.ts';
import { allocate, lockWeight, type Lock } from './weight.ts';

export interface Report {
  poe: '0.1';
  distribution: string;
  epoch: number;
  window: [number, number];
  ledgers: { open: { index: number; hash: string }; close: { index: number; hash: string } };
  emission: string;
  locks: { owner: string; tx: string; drops: string; created: number; unlock: number }[];
  payouts: { account: string; weight: string; units: string; amount: string }[];
  total_weight: string;
  dust: string;
}

// Trust line holders at a ledger: holder limit above zero, not frozen by the issuer (SPEC section 5).
async function participants(rpc: Rpc, manifest: Manifest, ledger: LedgerHeader): Promise<string[]> {
  const currency = ledgerCurrency(manifest.token.currency);
  const lines = await rpc.allPages('account_lines', { account: manifest.token.issuer }, 'lines', ledger.hash);
  const excluded = new Set([manifest.token.issuer, manifest.pool, ...manifest.exclude]);
  const holders = new Set<string>();
  for (const line of lines) {
    if (line.currency !== currency) continue;
    if (!(Number(line.limit_peer) > 0)) continue;
    if (line.freeze) continue;
    if (excluded.has(line.account)) continue;
    holders.add(line.account);
  }
  return [...holders].sort();
}

// The owner's locks at one ledger, read from ledger state (SPEC section 3).
async function locksAt(rpc: Rpc, owner: string, ledger: LedgerHeader): Promise<Map<string, Omit<Lock, 'created'> & { createdLedger: number }>> {
  const objects = await rpc.allPages('account_objects', { account: owner, type: 'escrow' }, 'account_objects', ledger.hash);
  const out = new Map<string, Omit<Lock, 'created'> & { createdLedger: number }>();
  for (const o of objects) {
    if (o.LedgerEntryType !== 'Escrow') continue;
    if (o.Account !== owner || o.Destination !== owner) continue;
    if (typeof o.Amount !== 'string') continue; // token escrows are not XRP locks
    if (o.Condition || o.FinishFunction) continue;
    if (typeof o.FinishAfter !== 'number') continue;
    out.set(o.PreviousTxnID, { owner, tx: o.PreviousTxnID, drops: BigInt(o.Amount), unlock: o.FinishAfter, createdLedger: o.PreviousTxnLgrSeq });
  }
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Everything after the ledger reads, as a pure function of the manifest and the
// locks found: which locks count (SPEC 3.2), their weights (4) and shares (5), and
// the report (7). Test vectors and other implementations can check against it.
export function buildReport(manifest: Manifest, epoch: number, ledgers: Report['ledgers'], locks: Lock[]): Report {
  const emission = emissionUnits(manifest, epoch);
  if (emission === null) throw new Error(`epoch ${epoch} is past the end of the schedule`);
  const [a, b] = epochWindow(manifest, epoch);
  const start = startRippleTime(manifest);
  const minDrops = BigInt(manifest.lock.min_drops);
  const excluded = new Set([manifest.token.issuer, manifest.pool, ...manifest.exclude]);

  const counted: Lock[] = [];
  const weights = new Map<string, bigint>();
  for (const lock of locks) {
    if (excluded.has(lock.owner)) continue;
    if (lock.unlock - lock.created < manifest.lock.min_seconds) continue;
    if (lock.drops < minDrops) continue;
    if (!manifest.lock.existing && lock.created < start) continue;
    const w = lockWeight(lock, a, b, manifest.lock.max_seconds);
    if (w === 0n) continue;
    counted.push(lock);
    weights.set(lock.owner, (weights.get(lock.owner) ?? 0n) + w);
  }
  const { units, total, dust } = allocate(emission, weights);

  return {
    poe: '0.1',
    distribution: distributionId(manifest),
    epoch,
    window: [a, b],
    ledgers: { open: { index: ledgers.open.index, hash: ledgers.open.hash }, close: { index: ledgers.close.index, hash: ledgers.close.hash } },
    emission: emission.toString(),
    locks: counted
      .sort((x, y) => (x.tx < y.tx ? -1 : x.tx > y.tx ? 1 : 0))
      .map((l) => ({ owner: l.owner, tx: l.tx, drops: l.drops.toString(), created: l.created, unlock: l.unlock })),
    payouts: [...weights.keys()].sort().map((account) => ({
      account,
      weight: weights.get(account)!.toString(),
      units: units.get(account)!.toString(),
      amount: fromUnits(units.get(account)!, manifest.decimals),
    })),
    total_weight: total.toString(),
    dust: dust.toString(),
  };
}

// Read the ledger for one epoch and build its report.
export async function computeEpoch(manifest: Manifest, epoch: number, rpc: Rpc): Promise<{ report: Report; hash: string }> {
  if (emissionUnits(manifest, epoch) === null) throw new Error(`epoch ${epoch} is past the end of the schedule`);
  const [a, b] = epochWindow(manifest, epoch);
  const latest = await rpc.validated();
  if (latest.close_time < b) throw new Error(`epoch ${epoch} has not closed yet (ends at Ripple time ${b}, latest ledger closed at ${latest.close_time})`);
  const open = await rpc.firstAtOrAfter(a, latest);
  const close = await rpc.firstAtOrAfter(b, latest);

  const holders = await participants(rpc, manifest, close);
  const perHolder = await mapLimit(holders, 4, async (owner) => {
    const found = new Map([...(await locksAt(rpc, owner, open)), ...(await locksAt(rpc, owner, close))]);
    const locks: Lock[] = [];
    for (const l of found.values()) {
      const created = (await rpc.header(l.createdLedger)).close_time;
      locks.push({ owner: l.owner, tx: l.tx, drops: l.drops, created, unlock: l.unlock });
    }
    return locks;
  });

  const report = buildReport(manifest, epoch, { open, close }, perHolder.flat());
  return { report, hash: hashOf(report) };
}
