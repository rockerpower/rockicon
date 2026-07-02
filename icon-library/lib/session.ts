import { auth } from '@/auth';
import { getEntitlement } from './entitlements-store';

// Identity comes from Auth.js (verified GitHub email). Entitlement (tier) is
// resolved from the entitlements store, keyed by that email — so a Stripe
// webhook can grant Pro out-of-band and the session can't fake it.

export async function currentEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

export async function tierFor(): Promise<'free' | 'pro'> {
  return getEntitlement(await currentEmail());
}

export async function isEntitled(): Promise<boolean> {
  return (await tierFor()) === 'pro';
}
