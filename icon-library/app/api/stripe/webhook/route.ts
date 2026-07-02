import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { setEntitlement } from '@/lib/entitlements-store';

export const dynamic = 'force-dynamic';

// Verify Stripe's `Stripe-Signature: t=<ts>,v1=<sig>` header against the raw
// body using STRIPE_WEBHOOK_SECRET. No SDK required.
function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')));
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 });

  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try { event = JSON.parse(payload); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const obj = event.data?.object ?? {};
  const email = ((obj.customer_email as string) || ((obj.customer_details as { email?: string })?.email) || '').toLowerCase();

  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
      if (email) await setEntitlement(email, 'pro', 'stripe-webhook');
      break;
    case 'customer.subscription.deleted':
    case 'invoice.payment_failed':
      if (email) await setEntitlement(email, 'free', 'stripe-webhook');
      break;
  }

  return NextResponse.json({ received: true });
}
