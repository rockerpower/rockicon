import { NextResponse } from 'next/server';
import { isEntitled } from '@/lib/session';
import { readAllProIcons } from '@/lib/pro-source';

export const dynamic = 'force-dynamic';

// Batch Pro delivery: all Pro vectors for a family, entitled users only.
// Lets the browse grid swap locked placeholders for real icons after unlock.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!isEntitled(req)) {
    return NextResponse.json({ error: 'Pro subscription required' }, { status: 402 });
  }
  return NextResponse.json({ icons: readAllProIcons(slug) }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
