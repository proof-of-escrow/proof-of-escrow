import { hashOf } from './canonical.ts';
import { ledgerCurrency } from './rpc.ts';
import type { Manifest } from './manifest.ts';
import type { Report } from './epoch.ts';

const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();

// Unsigned payments for one epoch report (SPEC section 7). Every signer can build
// the same list from the same report, so a multisig needs no coordinator to trust.
export function buildPayments(manifest: Manifest, report: Report, opts: { sequence?: number; fee?: string } = {}): Record<string, unknown>[] {
  const reportHash = hashOf(report);
  const txs: Record<string, unknown>[] = [];
  let seq = opts.sequence;
  for (const p of report.payouts) {
    if (BigInt(p.units) === 0n) continue;
    const tx: Record<string, unknown> = {
      TransactionType: 'Payment',
      Account: manifest.pool,
      Destination: p.account,
      Amount: { currency: ledgerCurrency(manifest.token.currency), issuer: manifest.token.issuer, value: p.amount },
      Memos: [{ Memo: { MemoType: hex('poe/epoch'), MemoData: reportHash } }],
    };
    if (seq !== undefined) tx.Sequence = seq++;
    if (opts.fee !== undefined) tx.Fee = opts.fee;
    txs.push(tx);
  }
  return txs;
}

// The memo a pool attaches to anchor its manifest (SPEC section 6.2).
export function manifestMemo(id: string) {
  return { Memo: { MemoType: hex('poe/manifest'), MemoData: id } };
}
