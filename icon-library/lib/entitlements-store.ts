import fs from 'fs';
import path from 'path';

// Server-side entitlement store, keyed by email. This is the persistence layer
// the cookie can't provide: it survives cookie clearing and lets the Stripe
// webhook grant Pro out-of-band.
//
// Backend selection:
// - If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set (production /
//   Vercel), use Upstash Redis via its REST API — durable, no SDK needed.
// - Otherwise fall back to a local JSON file, and to an in-memory map if the
//   filesystem is read-only. Good enough for local dev.

type Tier = 'free' | 'pro';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = !!(UPSTASH_URL && UPSTASH_TOKEN);

const keyFor = (email: string) => `ent:${email.toLowerCase()}`;

// ── Upstash Redis (REST) ─────────────────────────────────────────────────────
async function redisGet(email: string): Promise<Tier> {
  const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(keyFor(email))}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) return 'free';
  const data = await res.json();
  return data.result === 'pro' ? 'pro' : 'free';
}

async function redisSet(email: string, tier: Tier): Promise<void> {
  await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(keyFor(email))}/${tier}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: 'no-store',
  });
}

// ── Local file / in-memory fallback ─────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'entitlements.json');
interface Entry { tier: Tier; since: number; source?: string }
type Store = Record<string, Entry>;
const memory: Store = {};
let fileWritable = true;

function fileRead(): Store {
  let fromFile: Store = {};
  try { fromFile = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as Store; } catch { fromFile = {}; }
  return { ...fromFile, ...memory };
}

function fileWrite(store: Store): void {
  Object.assign(memory, store);
  if (!fileWritable) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2) + '\n');
  } catch {
    fileWritable = false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function getEntitlement(email: string | undefined | null): Promise<Tier> {
  if (!email) return 'free';
  if (useRedis) return redisGet(email);
  return fileRead()[email.toLowerCase()]?.tier ?? 'free';
}

export async function setEntitlement(email: string, tier: Tier, source = 'manual'): Promise<void> {
  if (useRedis) { await redisSet(email, tier); return; }
  const store = fileRead();
  store[email.toLowerCase()] = { tier, since: Math.floor(Date.now() / 1000), source };
  fileWrite(store);
}
