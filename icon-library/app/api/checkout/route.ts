import { NextResponse } from 'next/server';
import { currentEmail, tierFor } from '@/lib/session';
import { setEntitlement } from '@/lib/entitlements-store';

export const dynamic = 'force-dynamic';

// GET — entitlement status (tier resolved from the store).
export async function GET() {
  const email = await currentEmail();
  return NextResponse.json({ entitled: (await tierFor()) === 'pro', signedIn: !!email });
}

// POST — start checkout. Requires a signed-in session.
// - If STRIPE_SECRET_KEY is set: create a real Stripe Checkout Session and
//   return its URL for the client to redirect to. Entitlement is granted on
//   return via /api/checkout/confirm (or a webhook) after payment.
// - Otherwise (local dev): grant Pro immediately (mock).
export async function POST(req: Request) {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const origin = req.headers.get('origin') || new URL(req.url).origin;

  if (stripeKey && priceId) {
    // Create Checkout Session via Stripe REST API (no SDK dependency).
    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('customer_email', email);
    params.set('success_url', `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${origin}/?checkout=cancel`);

    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await resp.json();
    if (!resp.ok) return NextResponse.json({ error: data.error?.message ?? 'Stripe error' }, { status: 502 });
    return NextResponse.json({ mode: 'stripe', url: data.url });
  }

  // Mock grant (dev): mark Pro in the store.
  await setEntitlement(email, 'pro', 'mock-checkout');
  return NextResponse.json({ mode: 'mock', ok: true, entitled: true });
}

// DELETE — downgrade to Free in the store (for testing the gated state).
export async function DELETE() {
  const email = await currentEmail();
  if (email) await setEntitlement(email, 'free', 'mock-cancel');
  return NextResponse.json({ ok: true, entitled: false });
}
