import fs from 'fs';
import path from 'path';

// Server-side entitlement store, keyed by email. This is the persistence layer
// the cookie can't provide: it survives cookie clearing and lets the Stripe
// webhook grant Pro out-of-band. In production, swap the JSON file for a real
// database — the get/set interface stays the same.
//
// On a read-only serverless filesystem (e.g. Vercel), file writes fail; we fall
// back to an in-memory map so the flow still works within a warm instance.
// That is ephemeral and per-instance — use a real DB for durable entitlements.

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'entitlements.json');

type Tier = 'free' | 'pro';
interface Entry { tier: Tier; since: number; source?: string }
type Store = Record<string, Entry>;

const memory: Store = {};
let fileWritable = true;

function read(): Store {
  let fromFile: Store = {};
  try {
    fromFile = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as Store;
  } catch {
    fromFile = {};
  }
  // Memory overlays the file (covers reads after a fallback write).
  return { ...fromFile, ...memory };
}

function write(store: Store): void {
  Object.assign(memory, store);
  if (!fileWritable) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2) + '\n');
  } catch {
    // Read-only FS — keep entitlements in memory only for this instance.
    fileWritable = false;
  }
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
