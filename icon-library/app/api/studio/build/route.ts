import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { isStudioEnabled } from '@/lib/studio';

export const dynamic = 'force-dynamic';

const run = promisify(exec);

export async function POST() {
  if (!isStudioEnabled()) {
    return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  }
  try {
    const { stdout } = await run('npx tsx scripts/build-icons.ts', {
      cwd: process.cwd(),
      timeout: 60_000,
    });
    return NextResponse.json({ ok: true, log: stdout.trim() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
