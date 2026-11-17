#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { hashOf } from './canonical.ts';
import { computeEpoch, type Report } from './epoch.ts';
import { distributionId, parseManifest } from './manifest.ts';
import { buildPayments, manifestMemo } from './payouts.ts';
import { Rpc } from './rpc.ts';

const USAGE = `poe: Proof of Escrow reference calculator (read-only, holds no keys)

  poe id <manifest.json>                         distribution id and the anchor memo
  poe epoch <manifest.json> <n> [--out file]     compute the report for epoch n
  poe verify <manifest.json> <report.json>       recompute a report and compare
  poe payouts <manifest.json> <report.json> [--sequence n] [--fee drops]
                                                 unsigned payments for a report

  --rpc <url>   JSON-RPC server (default https://xrplcluster.com/, full history)`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

const readJson = (path: string | undefined, what: string) => {
  if (!path) throw new Error(`missing ${what}\n\n${USAGE}`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

async function main() {
  const args = process.argv.slice(2);
  const rpc = new Rpc(flag(args, '--rpc') ?? 'https://xrplcluster.com/');
  const out = flag(args, '--out');
  const sequence = flag(args, '--sequence');
  const fee = flag(args, '--fee');
  const [command, manifestPath, third] = args;
  if (!command || !manifestPath) return console.log(USAGE);
  const manifest = parseManifest(readJson(manifestPath, 'manifest'));

  if (command === 'id') {
    const id = distributionId(manifest);
    console.log(JSON.stringify({ id, anchor_memo: manifestMemo(id) }, null, 2));
  } else if (command === 'epoch') {
    const epoch = Number(third);
    if (!/^\d+$/.test(third ?? '') || !Number.isSafeInteger(epoch)) throw new Error(`epoch must be a whole number, got ${third ?? 'nothing'}`);
    const { report, hash } = await computeEpoch(manifest, epoch, rpc);
    const text = JSON.stringify(report, null, 2) + '\n';
    if (out) writeFileSync(out, text);
    else process.stdout.write(text);
    console.error(`epoch ${report.epoch}: ${report.payouts.length} participants, ${report.locks.length} locks, report ${hash}`);
  } else if (command === 'verify') {
    const claimed = readJson(third, 'report') as Report;
    const { report, hash } = await computeEpoch(manifest, claimed.epoch, rpc);
    const claimedHash = hashOf(claimed);
    if (claimedHash === hash) {
      console.log(`OK epoch ${claimed.epoch} report ${hash}`);
    } else {
      console.log(`MISMATCH epoch ${claimed.epoch}: claimed ${claimedHash}, recomputed ${hash}`);
      const mine = new Map(report.payouts.map((p) => [p.account, p.units]));
      const theirs = new Map(claimed.payouts.map((p) => [p.account, p.units]));
      for (const account of new Set([...mine.keys(), ...theirs.keys()])) {
        if (mine.get(account) !== theirs.get(account)) console.log(`  ${account}: claimed ${theirs.get(account) ?? '-'} units, recomputed ${mine.get(account) ?? '-'}`);
      }
      process.exitCode = 1;
    }
  } else if (command === 'payouts') {
    const report = readJson(third, 'report') as Report;
    if (report.distribution !== distributionId(manifest)) throw new Error('report belongs to a different distribution');
    const txs = buildPayments(manifest, report, { sequence: sequence ? Number(sequence) : undefined, fee });
    console.log(JSON.stringify(txs, null, 2));
  } else {
    console.log(USAGE);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
