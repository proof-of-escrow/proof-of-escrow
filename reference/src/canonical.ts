import { createHash } from 'node:crypto';

// Canonical JSON: keys sorted at every level, no whitespace. Numbers must be
// safe integers; amounts travel as strings so nothing depends on float output.
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`non-integer number in canonical JSON: ${value}`);
    return String(value);
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
  }
  throw new Error(`unsupported value in canonical JSON: ${typeof value}`);
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase();
}

export function hashOf(value: unknown): string {
  return sha256Hex(canonical(value));
}
