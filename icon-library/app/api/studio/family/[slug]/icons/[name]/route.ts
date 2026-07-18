import { NextResponse } from 'next/server';
import { isStudioEnabled, deleteSourceIcon } from '@/lib/studio';

export const dynamic = 'force-dynamic';

// Delete ALL weights of an icon (every bundle copy of this name). The
// file-manager's per-weight delete lives at ../file instead.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string; name: string }> }
) {
  if (!isStudioEnabled()) {
    return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  }
  const { slug, name } = await params;
  const removed = deleteSourceIcon(slug, name);
  if (removed === 0) return NextResponse.json({ error: 'Icon not found' }, { status: 404 });
  return NextResponse.json({ ok: true, removed });
}
