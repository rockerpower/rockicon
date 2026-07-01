import { NextResponse } from 'next/server';
import type { FamilyMeta } from '@/types';
import { isStudioEnabled, readSourceFamily, writeSourceFamily } from '@/lib/studio';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isStudioEnabled()) {
    return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  }
  const { slug } = await params;
  const family = readSourceFamily(slug);
  if (!family) {
    return NextResponse.json({ error: 'Family not found' }, { status: 404 });
  }
  return NextResponse.json({ family });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isStudioEnabled()) {
    return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  }
  const { slug } = await params;
  let body: { family?: FamilyMeta };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const family = body.family;
  if (!family || !family.id || !family.slug || !Array.isArray(family.bundles)) {
    return NextResponse.json({ error: 'Invalid family shape' }, { status: 400 });
  }
  writeSourceFamily(slug, family);
  return NextResponse.json({ ok: true, family });
}
