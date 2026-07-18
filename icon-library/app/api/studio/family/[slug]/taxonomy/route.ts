import { NextResponse } from 'next/server';
import { isStudioEnabled, deleteBundle, deleteCategory, deleteSubcategory } from '@/lib/studio';

export const dynamic = 'force-dynamic';

// Delete a taxonomy node (bundle | category | subcategory) by folder id. All
// three refuse while any icon still lives inside — the icons must be moved or
// deleted first. Removes the folder(s) on disk and the family.json entry.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isStudioEnabled()) return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id') ?? '';
  const categoryId = searchParams.get('categoryId') ?? '';

  let res: { ok: boolean; error?: string };
  if (type === 'bundle') res = deleteBundle(slug, id);
  else if (type === 'category') res = deleteCategory(slug, id);
  else if (type === 'subcategory') res = deleteSubcategory(slug, categoryId, id);
  else return NextResponse.json({ error: 'type must be bundle|category|subcategory' }, { status: 400 });

  if (!res.ok) return NextResponse.json({ error: res.error ?? 'Delete failed' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
