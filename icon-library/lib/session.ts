import crypto from 'crypto';
import { getEntitlement } from './entitlements-store';

// Session cookie carries identity only (email). Entitlement (tier) is resolved
// server-side from the entitlements store, so a Stripe webhook can grant Pro
// out-of-band and cookie tampering can't fake it. Signed + HttpOnly.

export const SESSION_COOKIE = 'il_session';

const SECRET = process.env.SESSION_SECRET || process.env.ENTITLEMENT_SECRET || 'dev-insecure-secret-change-me';

export interface Session {
  email: string;
  iat: number;
}

export function signSession(session: Session): string {
  const body = Buffer.from(JSON.stringify(session)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token: string | undefined): Session | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
    if (typeof s.email !== 'string' || !s.email) return null;
    return s;
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function getSession(req: Request): Session | null {
  return verify(readCookie(req, SESSION_COOKIE));
}

// Tier is resolved from the store, never from the cookie.
export function tierFor(req: Request): Promise<'free' | 'pro'> {
  return getEntitlement(getSession(req)?.email);
}

export async function isEntitled(req: Request): Promise<boolean> {
  return (await tierFor(req)) === 'pro';
}

export function newSession(email: string): Session {
  return { email, iat: Math.floor(Date.now() / 1000) };
}
