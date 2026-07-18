import { NextResponse } from 'next/server';
import { isStudioEnabled, moveSourceFile, deleteSourceFile, type FileLoc, type FileTarget } from '@/lib/studio';

export const dynamic = 'force-dynamic';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

function parseLoc(o: Record<string, unknown>): FileLoc | null {
  const bundleId = str(o.bundleId), categoryId = str(o.categoryId), name = str(o.name);
  if (!bundleId || !categoryId || !name) return null;
  return { bundleId, categoryId, subcategoryId: str(o.subcategoryId), name };
}

// A move target has no filename (the moved file keeps its name).
function parseTarget(o: Record<string, unknown>): FileTarget | null {
  const bundleId = str(o.bundleId), categoryId = str(o.categoryId);
  if (!bundleId || !categoryId) return null;
  return { bundleId, categoryId, subcategoryId: str(o.subcategoryId) };
}

// Move one file (this weight only) from `from` to `to` (bundle/category/sub).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isStudioEnabled()) return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const from = parseLoc((body.from ?? {}) as Record<string, unknown>);
  const to = parseTarget((body.to ?? {}) as Record<string, unknown>);
  if (!from) return NextResponse.json({ error: 'from required (bundleId, categoryId, name)' }, { status: 400 });
  if (!to) return NextResponse.json({ error: 'to required (bundleId, categoryId)' }, { status: 400 });

  const res = moveSourceFile(slug, from, to);
  if (!res.ok) return NextResponse.json({ error: res.error ?? 'Move failed' }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// Delete one file (this weight only).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isStudioEnabled()) return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const loc = parseLoc({
    bundleId: searchParams.get('bundleId'),
    categoryId: searchParams.get('categoryId'),
    subcategoryId: searchParams.get('subcategoryId') ?? undefined,
    name: searchParams.get('name'),
  });
  if (!loc) return NextResponse.json({ error: 'bundleId, categoryId, name required' }, { status: 400 });

  const removed = deleteSourceFile(slug, loc);
  if (!removed) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
