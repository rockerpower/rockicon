import { NextResponse } from 'next/server';
import { currentEmail, tierFor } from '@/lib/session';
import { getFamilyIndex } from '@/lib/icons-data';
import { readProIcon } from '@/lib/pro-source';
import { buildSvgMarkup, toJsx, toVue } from '@/lib/svg-render';
import { consumeDownload } from '@/lib/rate-limit';
import {
  FORMAT_ACCESS, FREE_ATTRIBUTION, FREE_FIXED_SIZE, FREE_FIXED_STROKE, canAccessFormat, canAccessIcon,
  clampColorForTier, isFreeFormat, type ExportFormat,
} from '@/lib/licensing';
import type { IconVariant } from '@/types';

export const dynamic = 'force-dynamic';

const FORMATS = new Set<ExportFormat>(['svg', 'png', 'jsx', 'vue']);
const upgrade = (msg: string, format: ExportFormat) =>
  NextResponse.json({ error: msg, requiredTier: 'pro', upgradeUrl: '/pricing', format }, { status: 402 });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; name: string }> }
) {
  const { slug, name } = await params;
  const url = new URL(req.url);
  const bundleId = url.searchParams.get('bundle') || '';
  const format = url.searchParams.get('format') as ExportFormat;
  if (!FORMATS.has(format)) return NextResponse.json({ error: 'Unknown format' }, { status: 400 });

  const idx = getFamilyIndex(slug);
  const icon = idx?.icons.find(i => i.name.replace(/\s+/g, '-') === name || i.name === name || i.id.endsWith(`__${name}`));
  if (!idx || !icon) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userTier = await tierFor();
  const email = await currentEmail();

  // Axis 1 — icon tier
  if (!canAccessIcon(userTier, icon.tier)) {
    return upgrade('This icon is part of the Pro set', format);
  }
  // Axis 2 — format tier
  if (!canAccessFormat(userTier, format)) {
    return upgrade(`${FORMAT_ACCESS[format] === 'pro' ? 'Pro plan required' : 'Upgrade required'} for ${format.toUpperCase()} export`, format);
  }

  // Rate limit — Free tier + Free format only (Pro is unlimited).
  let attribution: string | undefined;
  if (userTier === 'free' && isFreeFormat(format)) {
    const id = email || (req.headers.get('x-forwarded-for')?.split(',')[0].trim()) || 'anon';
    const rl = await consumeDownload(id);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Free daily limit reached (${rl.limit}/day). Upgrade to Pro for unlimited downloads.`, requiredTier: 'pro', upgradeUrl: '/pricing', rateLimited: true },
        { status: 429 },
      );
    }
    attribution = FREE_ATTRIBUTION;
  }

  // Resolve the vector. Pro icons have empty paths in the public index — read
  // the real geometry server-side (already gated to Pro users above).
  let variant: IconVariant | undefined;
  if (icon.tier === 'pro') {
    const pro = readProIcon(slug, name);
    variant = pro?.variants.find(v => v.bundleId === bundleId) ?? pro?.variants[0];
  } else {
    variant = icon.variants.find(v => v.bundleId === bundleId) ?? icon.variants[0];
  }
  if (!variant || variant.paths.length === 0) return NextResponse.json({ error: 'No vector' }, { status: 404 });

  // Live size / stroke / color is a Pro feature — Free exports are pinned to
  // 24px / 2px stroke / black-or-white regardless of what the client sends.
  const reqSize = Number(url.searchParams.get('size'));
  const reqStroke = Number(url.searchParams.get('strokeWidth'));
  const reqColor = url.searchParams.get('color') || 'currentColor';
  const size = userTier === 'pro' && Number.isFinite(reqSize) && reqSize > 0 ? reqSize : FREE_FIXED_SIZE;
  const strokeWidth = userTier === 'pro' && Number.isFinite(reqStroke) && reqStroke > 0 ? reqStroke : FREE_FIXED_STROKE;
  const color = clampColorForTier(userTier, reqColor);

  const markup = buildSvgMarkup(variant, { size, color, strokeWidth });
  const base = name.replace(/\s+/g, '-');
  let content = markup, filename = `${base}.svg`;
  if (format === 'jsx') { content = toJsx(markup, name); filename = `${base}.jsx`; }
  else if (format === 'vue') { content = toVue(markup, name); filename = `${base}.vue`; }
  // png: return the SVG; the client rasterizes it locally.

  return NextResponse.json({ format, filename, content, attribution }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
