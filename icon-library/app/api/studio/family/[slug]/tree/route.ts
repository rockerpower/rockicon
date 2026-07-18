import { NextResponse } from 'next/server';
import { isStudioEnabled, listSourceTree } from '@/lib/studio';

export const dynamic = 'force-dynamic';

// Raw on-disk folder tree (bundle → category → subcategory → icons) plus
// cross-bundle inconsistency warnings. Powers the Studio file-manager.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isStudioEnabled()) {
    return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  }
  const { slug } = await params;
  return NextResponse.json({ tree: listSourceTree(slug) });
}
