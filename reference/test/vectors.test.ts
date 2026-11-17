import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { hashOf } from '../src/canonical.ts';
import { buildReport, type Report } from '../src/epoch.ts';
import { distributionId, epochWindow, parseManifest } from '../src/manifest.ts';
import type { Lock } from '../src/weight.ts';

// Reports from the testnet run in examples/testnet. Any implementation should
// rebuild each one from its locks and get the same hash.
const dir = new URL('../examples/testnet/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const manifest = parseManifest(read('manifest.json'));

const vectors: Record<string, string> = {
  'report0.json': 'F9AC61735472DC7D73ACCCA587834529C4BED33E783E3A12880E1AA111CDF78A',
  'report1.json': 'D5E6E384C58402746EC9716863A78F17466BBAB6AB613ECE32D8C69B4D41FFBC',
};

test('testnet manifest id', () => {
  assert.equal(distributionId(manifest), '019C3F775C164232DCE072F1B266A089AAF5DC777E8DDE9E3023867FDD8F96F0');
});

for (const [file, hash] of Object.entries(vectors)) {
  test(`${file} rebuilds from its locks`, () => {
    const claimed = read(file) as Report;
    const locks: Lock[] = claimed.locks.map((l) => ({ ...l, drops: BigInt(l.drops) }));
    const rebuilt = buildReport(manifest, claimed.epoch, claimed.ledgers, locks);
    assert.deepEqual(rebuilt, claimed);
    assert.equal(hashOf(rebuilt), hash);
  });
}

test('locks that break the rules are not counted', () => {
  const [a] = epochWindow(manifest, 0);
  const ledgers = { open: { index: 1, hash: 'A' }, close: { index: 2, hash: 'B' } };
  const ok: Lock = { owner: 'rAlice', tx: '1', drops: 30000000n, created: a, unlock: a + 7200 };
  const locks: Lock[] = [
    ok,
    { ...ok, tx: '2', unlock: a + 90 }, // shorter than lock.min_seconds
    { ...ok, tx: '3', drops: 999999n }, // smaller than lock.min_drops
    { ...ok, tx: '4', created: a - 10 }, // created before start, lock.existing is false
    { ...ok, tx: '5', owner: manifest.pool }, // the pool never participates
  ];
  const report = buildReport(manifest, 0, ledgers, locks);
  assert.deepEqual(report.locks.map((l) => l.tx), ['1']);
  assert.equal(report.payouts.length, 1);
  assert.equal(report.payouts[0].units, report.emission);
});
