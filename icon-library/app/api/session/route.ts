import { NextResponse } from 'next/server';
import { currentEmail, tierFor } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Current session: verified email (from Auth.js) + tier (from the store).
// Login/logout are handled by Auth.js at /api/auth/*.
export async function GET() {
  const email = await currentEmail();
  return NextResponse.json({ session: email ? { email, tier: await tierFor() } : null });
}
