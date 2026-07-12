import { NextResponse } from 'next/server';
import { isStudioEnabled, deleteSourceIcon, moveSourceIcon } from '@/lib/studio';

export const dynamic = 'force-dynamic';

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

// Move an icon to a different category/subcategory (relocates its files on
// disk across every bundle it exists in — category membership is derived
// from folder placement, there's no DB row to update).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string; name: string }> }
) {
  if (!isStudioEnabled()) {
    return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  }
  const { slug, name } = await params;
  const body = await req.json().catch(() => ({}));
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId : undefined;
  const subcategoryId = typeof body.subcategoryId === 'string' ? body.subcategoryId : undefined;
  if (!categoryId) return NextResponse.json({ error: 'categoryId required' }, { status: 400 });

  const moved = moveSourceIcon(slug, name, categoryId, subcategoryId);
  if (moved === 0) return NextResponse.json({ error: 'Move failed — icon or target category not found, or already there' }, { status: 404 });
  return NextResponse.json({ ok: true, moved });
}
