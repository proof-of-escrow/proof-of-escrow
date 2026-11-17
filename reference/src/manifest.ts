import { hashOf } from './canonical.ts';

export const RIPPLE_EPOCH = 946684800;

export interface Manifest {
  poe: '0.1';
  name: string;
  token: { currency: string; issuer: string };
  pool: string;
  start: string;
  epoch_seconds: number;
  decimals: number;
  schedule: { epochs: number; per_epoch: string }[];
  lock: { min_seconds: number; max_seconds: number; min_drops: string; existing: boolean };
  exclude: string[];
}

const DEFAULTS = {
  epoch_seconds: 86400,
  decimals: 6,
  lock: { min_seconds: 2592000, max_seconds: 157680000, min_drops: '1000000', existing: false },
  exclude: [] as string[],
};

// Fill defaults and check every rule in SPEC section 6.1. Throws on the first problem.
export function parseManifest(raw: unknown): Manifest {
  const m = raw as Partial<Manifest> & { lock?: Partial<Manifest['lock']> };
  const fail = (msg: string): never => { throw new Error(`manifest: ${msg}`); };
  if (m.poe !== '0.1') fail('poe must be "0.1"');
  if (!m.token?.currency || !m.token?.issuer) fail('token.currency and token.issuer are required');
  if (!m.pool) fail('pool is required');
  if (m.pool === m.token!.issuer) fail('pool must not be the issuer');
  if (!m.start || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(m.start)) fail('start must be UTC like 2027-01-01T00:00:00Z');
  const manifest: Manifest = {
    poe: '0.1',
    name: m.name ?? '',
    token: { currency: m.token!.currency, issuer: m.token!.issuer },
    pool: m.pool!,
    start: m.start!,
    epoch_seconds: m.epoch_seconds ?? DEFAULTS.epoch_seconds,
    decimals: m.decimals ?? DEFAULTS.decimals,
    schedule: m.schedule ?? fail('schedule is required'),
    lock: { ...DEFAULTS.lock, ...(m.lock ?? {}) },
    exclude: m.exclude ?? DEFAULTS.exclude,
  };
  if (!Number.isSafeInteger(manifest.epoch_seconds) || manifest.epoch_seconds <= 0) fail('epoch_seconds must be a positive integer');
  if (!Number.isInteger(manifest.decimals) || manifest.decimals < 0 || manifest.decimals > 15) fail('decimals must be 0 to 15');
  if (manifest.lock.min_seconds < 2 * manifest.epoch_seconds) fail('lock.min_seconds must be at least 2 * epoch_seconds');
  if (manifest.lock.max_seconds <= 0) fail('lock.max_seconds must be positive');
  if (!/^\d+$/.test(manifest.lock.min_drops)) fail('lock.min_drops must be an integer string');
  if (!Array.isArray(manifest.schedule) || manifest.schedule.length === 0) fail('schedule must be a non-empty list');
  for (const phase of manifest.schedule) {
    if (!Number.isSafeInteger(phase.epochs) || phase.epochs <= 0) fail('every schedule phase needs a positive epochs count');
    toUnits(phase.per_epoch, manifest.decimals);
  }
  return manifest;
}

export function distributionId(manifest: Manifest): string {
  return hashOf(manifest);
}

export function startRippleTime(manifest: Manifest): number {
  return Date.parse(manifest.start) / 1000 - RIPPLE_EPOCH;
}

export function epochWindow(manifest: Manifest, epoch: number): [number, number] {
  const a = startRippleTime(manifest) + epoch * manifest.epoch_seconds;
  return [a, a + manifest.epoch_seconds];
}

export function totalEpochs(manifest: Manifest): number {
  return manifest.schedule.reduce((n, p) => n + p.epochs, 0);
}

// Emission for one epoch in integer token units, or null past the end of the schedule.
export function emissionUnits(manifest: Manifest, epoch: number): bigint | null {
  let first = 0;
  for (const phase of manifest.schedule) {
    if (epoch < first + phase.epochs) return toUnits(phase.per_epoch, manifest.decimals);
    first += phase.epochs;
  }
  return null;
}

export function toUnits(decimal: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(decimal);
  if (!match) throw new Error(`not a plain decimal: ${decimal}`);
  const frac = match[2] ?? '';
  if (frac.length > decimals) throw new Error(`${decimal} has more than ${decimals} decimal places`);
  return BigInt(match[1] + frac.padEnd(decimals, '0'));
}

export function fromUnits(units: bigint, decimals: number): string {
  const digits = units.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}
