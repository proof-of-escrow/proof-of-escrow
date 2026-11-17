export interface Lock {
  owner: string;
  tx: string;
  drops: bigint;
  created: number; // Ripple time
  unlock: number; // Ripple time (FinishAfter)
}

// SPEC section 4.2: twice the integral of w(t) over [a, b), times M.
// The 2 and the M divide out when shares are taken, so everything stays integral.
export function lockWeight(lock: Lock, a: number, b: number, maxSeconds: number): bigint {
  const s = Math.max(a, lock.created);
  const e = Math.min(b, lock.unlock);
  if (s >= e) return 0n;
  const M = BigInt(maxSeconds);
  const unlock = BigInt(lock.unlock);
  const k = lock.unlock - maxSeconds;
  const flat = BigInt(Math.max(0, Math.min(e, k) - s));
  const x = Math.max(s, k);
  let linear = 0n;
  if (x < e) {
    const fromX = unlock - BigInt(x);
    const fromE = unlock - BigInt(e);
    linear = fromX * fromX - fromE * fromE;
  }
  return lock.drops * (2n * M * flat + linear);
}

// SPEC section 5: floor(E * W / total) per account, with the remainder as dust.
export function allocate(emission: bigint, weights: Map<string, bigint>): { units: Map<string, bigint>; total: bigint; dust: bigint } {
  let total = 0n;
  for (const w of weights.values()) total += w;
  const units = new Map<string, bigint>();
  if (total === 0n) return { units, total, dust: emission };
  let paid = 0n;
  for (const [account, w] of weights) {
    const u = (emission * w) / total;
    units.set(account, u);
    paid += u;
  }
  return { units, total, dust: emission - paid };
}
