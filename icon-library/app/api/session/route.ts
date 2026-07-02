import { NextResponse } from 'next/server';
import { SESSION_COOKIE, getSession, signSession, newSession, tierFor } from '@/lib/session';
import { getEntitlement } from '@/lib/entitlements-store';

export const dynamic = 'force-dynamic';

function sessionCookieOpts() {
  return { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30 };
}

// GET — current session status (tier resolved from the store).
export async function GET(req: Request) {
  const s = getSession(req);
  return NextResponse.json({ session: s ? { email: s.email, tier: await tierFor(req) } : null });
}

// POST — mock login. In production, replace with a real auth provider
// (OAuth / magic link). Issues an identity session; tier comes from the store.
export async function POST(req: Request) {
  let body: { email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const email = (body.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, session: { email, tier: await getEntitlement(email) } });
  res.cookies.set(SESSION_COOKIE, signSession(newSession(email)), sessionCookieOpts());
  return res;
}

// DELETE — logout.
export async function DELETE() {
  const res = NextResponse.json({ ok: true, session: null });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
