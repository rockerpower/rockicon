import { NextResponse } from 'next/server';
import { isStudioEnabled, listSourceIcons } from '@/lib/studio';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isStudioEnabled()) {
    return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  }
  const { slug } = await params;
  return NextResponse.json({ icons: listSourceIcons(slug) });
}
