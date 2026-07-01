import fs from 'fs';
import path from 'path';

// Server-side entitlement store, keyed by email. This is the persistence layer
// the cookie can't provide: it survives cookie clearing and lets the Stripe
// webhook grant Pro out-of-band. In production, swap the JSON file for a real
// database — the get/set interface stays the same.

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'entitlements.json');

type Tier = 'free' | 'pro';
interface Entry { tier: Tier; since: number; source?: string }
type Store = Record<string, Entry>;

function read(): Store {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as Store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2) + '\n');
}

export function getEntitlement(email: string | undefined | null): Tier {
  if (!email) return 'free';
  return read()[email.toLowerCase()]?.tier ?? 'free';
}

export function setEntitlement(email: string, tier: Tier, source = 'manual'): void {
  const key = email.toLowerCase();
  const store = read();
  store[key] = { tier, since: Math.floor(Date.now() / 1000), source };
  write(store);
}
