import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { setEntitlement } from '@/lib/entitlements-store';

export const dynamic = 'force-dynamic';

// Stripe return handler: verify the completed Checkout Session belongs to the
// signed-in user and was paid, then upgrade the session to Pro. Called by the
// client after redirect to /?checkout=success&session_id=...
export async function POST(req: Request) {
  const s = getSession(req);
  if (!s) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 });

  let body: { sessionId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(body.sessionId)}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const data = await resp.json();
  if (!resp.ok) return NextResponse.json({ error: data.error?.message ?? 'Stripe error' }, { status: 502 });

  const paid = data.payment_status === 'paid' || data.status === 'complete';
  const emailMatches = (data.customer_email ?? data.customer_details?.email ?? '').toLowerCase() === s.email;
  if (!paid || !emailMatches) {
    return NextResponse.json({ error: 'Payment not verified' }, { status: 402 });
  }

  setEntitlement(s.email, 'pro', 'stripe-confirm');
  return NextResponse.json({ ok: true, entitled: true });
}
