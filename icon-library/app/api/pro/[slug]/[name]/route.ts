import { NextResponse } from 'next/server';
import { isEntitled } from '@/lib/session';
import { readProIcon } from '@/lib/pro-source';

export const dynamic = 'force-dynamic';

// Serverless Pro delivery: returns the full vector geometry for a single Pro
// icon, but ONLY to entitled subscribers. Unauthenticated requests get 402 and
// never see the paths — this is the enforcement point for the security
// invariant (Pro vectors live only in icons-source, delivered on demand here).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; name: string }> }
) {
  const { slug, name } = await params;

  if (!isEntitled(req)) {
    return NextResponse.json({ error: 'Pro subscription required' }, { status: 402 });
  }

  const icon = readProIcon(slug, name);
  if (!icon) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ icon }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
