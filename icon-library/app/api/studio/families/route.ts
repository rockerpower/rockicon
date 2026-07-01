import { NextResponse } from 'next/server';
import { isStudioEnabled, listSourceFamilies } from '@/lib/studio';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isStudioEnabled()) {
    return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  }
  return NextResponse.json({ families: listSourceFamilies() });
}
