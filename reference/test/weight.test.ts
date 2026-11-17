import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canonical, hashOf } from '../src/canonical.ts';
import { emissionUnits, fromUnits, parseManifest, toUnits } from '../src/manifest.ts';
import { allocate, lockWeight, type Lock } from '../src/weight.ts';

const lock = (drops: bigint, created: number, unlock: number): Lock => ({ owner: 'r', tx: 't', drops, created, unlock });

// Brute-force 2 * M * integral of w(t) with 1-second steps, for checking the closed form.
function bruteForce(l: Lock, a: number, b: number, M: number): bigint {
  let twiceSum = 0n;
  for (let t = a; t < b; t++) {
    if (t < l.created || t >= l.unlock) continue;
    // integral of min(unlock - u, M) over [t, t+1) is the average of its ends when linear
    const r0 = Math.min(l.unlock - t, M);
    const r1 = Math.min(l.unlock - t - 1, M);
    twiceSum += BigInt(r0 + r1);
  }
  return l.drops * BigInt(M) * twiceSum / BigInt(M);
}

test('full weight while more than M remains', () => {
  assert.equal(lockWeight(lock(1n, 0, 1000), 0, 10, 100), 2000n);
});

test('linear region', () => {
  // 2 * integral_0^10 (50 - t) dt = 900
  assert.equal(lockWeight(lock(1n, 0, 50), 0, 10, 100), 900n);
});

test('crossing from flat to linear inside the epoch', () => {
  // flat 0..5 at 100, then 105 - t from 5..10: 2 * (500 + 487.5) = 1975
  assert.equal(lockWeight(lock(1n, 0, 105), 0, 10, 100), 1975n);
});

test('closed form matches brute force over awkward windows', () => {
  const M = 97;
  for (const [created, unlock, a, b] of [[3, 150, 0, 60], [0, 120, 40, 90], [25, 70, 0, 200], [10, 400, 290, 380], [0, 50, 60, 90]]) {
    const l = lock(7n, created, unlock);
    assert.equal(lockWeight(l, a, b, M), bruteForce(l, a, b, M), `${created},${unlock},[${a},${b})`);
  }
});

test('outside the lock is zero', () => {
  assert.equal(lockWeight(lock(5n, 100, 200), 0, 100, 50), 0n);
  assert.equal(lockWeight(lock(5n, 100, 200), 200, 300, 50), 0n);
});

test('allocation floors and keeps dust', () => {
  const { units, dust, total } = allocate(10n, new Map([['a', 1n], ['b', 1n], ['c', 1n]]));
  assert.deepEqual([...units.values()], [3n, 3n, 3n]);
  assert.equal(dust, 1n);
  assert.equal(total, 3n);
});

test('no participants keeps the whole emission in the pool', () => {
  const { units, dust } = allocate(10n, new Map());
  assert.equal(units.size, 0);
  assert.equal(dust, 10n);
});

test('units round-trip', () => {
  assert.equal(toUnits('115384.615384', 6), 115384615384n);
  assert.equal(fromUnits(115384615384n, 6), '115384.615384');
  assert.equal(fromUnits(5000000n, 6), '5');
  assert.equal(fromUnits(5n, 6), '0.000005');
  assert.throws(() => toUnits('1.1234567', 6));
});

test('canonical JSON sorts keys and rejects floats', () => {
  assert.equal(canonical({ b: 1, a: [{ d: 'x', c: true }] }), '{"a":[{"c":true,"d":"x"}],"b":1}');
  assert.throws(() => canonical({ a: 1.5 }));
});

test('manifest defaults, schedule and id are stable', () => {
  const m = parseManifest({
    poe: '0.1', name: 'Example', token: { currency: 'EXA', issuer: 'rIssuer' }, pool: 'rPool',
    start: '2027-01-01T00:00:00Z', schedule: [{ epochs: 2, per_epoch: '10' }, { epochs: 1, per_epoch: '5' }],
  });
  assert.equal(m.lock.max_seconds, 157680000);
  assert.equal(emissionUnits(m, 1), 10000000n);
  assert.equal(emissionUnits(m, 2), 5000000n);
  assert.equal(emissionUnits(m, 3), null);
  assert.equal(hashOf(m), hashOf(parseManifest(JSON.parse(JSON.stringify(m)))));
  assert.throws(() => parseManifest({ ...m, lock: { min_seconds: 100 } }), /min_seconds/);
  assert.throws(() => parseManifest({ ...m, pool: 'rIssuer' }), /issuer/);
});
