// Per-user daily download counter for the Free tier. Uses Upstash Redis when
// configured (same env as the entitlements store); falls back to an in-memory
// map otherwise. Best-effort — Free SVG paths are public, so this is a nudge,
// not a hard wall. Pro users are never counted.
import { FREE_DAILY_LIMIT } from './licensing';

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const useRedis = !!(URL_ && TOKEN);

const memory = new Map<string, { count: number; day: string }>();

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}
function keyFor(email: string): string {
  return `dl:${email.toLowerCase()}:${today()}`;
}

async function redisIncr(key: string): Promise<number> {
  const res = await fetch(`${URL_}/incr/${encodeURIComponent(key)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, cache: 'no-store',
  });
  const data = await res.json();
  const n = Number(data.result) || 0;
  if (n === 1) {
    // first hit today — expire in 48h so it rolls over cleanly
    fetch(`${URL_}/expire/${encodeURIComponent(key)}/172800`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, cache: 'no-store',
    }).catch(() => {});
  }
  return n;
}

export interface RateResult { allowed: boolean; used: number; limit: number; remaining: number }

// Increment and check the caller's daily count. Returns allowed=false when the
// cap is already reached (this call is still counted so repeated attempts don't
// slip through).
export async function consumeDownload(email: string): Promise<RateResult> {
  const limit = FREE_DAILY_LIMIT;
  let used: number;
  if (useRedis) {
    used = await redisIncr(keyFor(email));
  } else {
    const day = today();
    const cur = memory.get(email);
    used = cur && cur.day === day ? cur.count + 1 : 1;
    memory.set(email, { count: used, day });
  }
  return { allowed: used <= limit, used, limit, remaining: Math.max(0, limit - used) };
}
