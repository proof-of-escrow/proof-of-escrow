// Minimal XRP Ledger JSON-RPC client over fetch. No dependencies.

export interface LedgerHeader { index: number; hash: string; close_time: number }

const TRANSIENT = new Set(['lgrNotFound', 'tooBusy', 'slowDown', 'noNetwork', 'noCurrent', 'noClosed']);

export class Rpc {
  url: string;
  private headers = new Map<number, LedgerHeader>();

  constructor(url: string) {
    this.url = url;
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<any> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(this.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': 'proof-of-escrow/0.1' },
          body: JSON.stringify({ method, params: [params] }),
        });
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as any;
        const result = body.result;
        if (result?.status === 'error' || result?.error) {
          // Only a server that is busy or behind is worth asking again.
          const err = new Error(`${method} on ${this.url}: ${result.error_message ?? result.error}`);
          (err as any).fatal = !TRANSIENT.has(result.error);
          throw err;
        }
        return result;
      } catch (err) {
        if ((err as any).fatal) throw err;
        lastError = err;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  async validated(): Promise<LedgerHeader> {
    const r = await this.request('ledger', { ledger_index: 'validated' });
    return this.remember(r);
  }

  async header(index: number): Promise<LedgerHeader> {
    const cached = this.headers.get(index);
    if (cached) return cached;
    const r = await this.request('ledger', { ledger_index: index });
    if (!r.validated) throw new Error(`ledger ${index} is not validated on ${this.url}`);
    return this.remember(r);
  }

  private remember(r: any): LedgerHeader {
    const l = r.ledger;
    const h: LedgerHeader = { index: Number(r.ledger_index ?? l.ledger_index), hash: r.ledger_hash ?? l.ledger_hash, close_time: Number(l.close_time) };
    this.headers.set(h.index, h);
    return h;
  }

  // First validated ledger whose close time is at or after `time` (Ripple time).
  async firstAtOrAfter(time: number, latest: LedgerHeader): Promise<LedgerHeader> {
    if (latest.close_time < time) throw new Error(`no validated ledger closes at or after ${time} yet`);
    // Ledgers close every 3 to 5 seconds, so this lower bound is safely early.
    let lo = Math.max(1, latest.index - Math.ceil((latest.close_time - time) / 2) - 1000);
    let hi = latest.index;
    while ((await this.header(lo)).close_time >= time && lo > 1) {
      hi = lo;
      lo = Math.max(1, lo - 100000);
    }
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if ((await this.header(mid)).close_time >= time) hi = mid;
      else lo = mid;
    }
    const low = await this.header(lo);
    return low.close_time >= time ? low : this.header(hi);
  }

  // Every page of a paginated command, checked against the expected ledger hash.
  async allPages(method: string, params: Record<string, unknown>, field: string, ledgerHash: string): Promise<any[]> {
    const out: any[] = [];
    let marker: unknown;
    do {
      const r = await this.request(method, { ...params, ledger_hash: ledgerHash, limit: 400, ...(marker ? { marker } : {}) });
      if (r.ledger_hash && r.ledger_hash !== ledgerHash) throw new Error(`${method} answered for ledger ${r.ledger_hash}, expected ${ledgerHash}`);
      out.push(...(r[field] ?? []));
      marker = r.marker;
    } while (marker);
    return out;
  }
}

// Ledger form of a currency code: 3 characters as-is, anything longer as 40 hex characters.
export function ledgerCurrency(code: string): string {
  if (code.length === 3 || /^[0-9A-F]{40}$/.test(code)) return code;
  const hex = Buffer.from(code, 'utf8').toString('hex').toUpperCase();
  if (hex.length > 40) throw new Error(`currency code too long: ${code}`);
  return hex.padEnd(40, '0');
}
