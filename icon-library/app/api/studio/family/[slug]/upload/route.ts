import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isStudioEnabled, readSourceFamily, writeSourceFamily } from '@/lib/studio';
import { PREDEFINED_BUNDLES } from '@/taxonomy.config';
import type { FamilyMeta } from '@/types';

export const dynamic = 'force-dynamic';

const SOURCE_DIR = path.join(process.cwd(), 'icons-source');
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const humanize = (id: string) => id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Add any bundles/categories/subcategories referenced by items that don't yet
// exist in the family. Returns true if the family was mutated (and persisted).
function ensureTaxonomy(slug: string, family: FamilyMeta, items: UploadItem[]): boolean {
  let changed = false;
  for (const item of items) {
    if (item.bundleId && !family.bundles.some(b => b.id === item.bundleId)) {
      const preset = PREDEFINED_BUNDLES.find(p => p.id === item.bundleId);
      family.bundles.push(preset
        ? { id: preset.id, name: preset.name, strokeBased: preset.strokeBased, predefined: true }
        : { id: item.bundleId, name: humanize(item.bundleId), strokeBased: false, predefined: false });
      changed = true;
    }
    if (item.categoryId && !family.categories.some(c => c.id === item.categoryId)) {
      family.categories.push({ id: item.categoryId, name: humanize(item.categoryId), subcategories: [] });
      changed = true;
    }
    if (item.categoryId && item.subcategoryId) {
      const cat = family.categories.find(c => c.id === item.categoryId);
      if (cat && !cat.subcategories.some(s => s.id === item.subcategoryId)) {
        cat.subcategories.push({ id: item.subcategoryId, name: humanize(item.subcategoryId) });
        changed = true;
      }
    }
  }
  if (changed) writeSourceFamily(slug, family);
  return changed;
}

interface UploadItem {
  bundleId: string;
  categoryId: string;
  subcategoryId?: string;
  name: string;
  svg: string;
}

function isSafeSvg(svg: string): boolean {
  const s = svg.trim();
  if (!s.startsWith('<svg') && !s.startsWith('<?xml')) return false;
  if (!/<svg[\s>]/i.test(s)) return false;
  // reject scripts / event handlers / external refs
  if (/<script|on\w+\s*=|xlink:href\s*=\s*["']?\s*http|href\s*=\s*["']?\s*http/i.test(s)) return false;
  return true;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isStudioEnabled()) {
    return NextResponse.json({ error: 'Studio disabled' }, { status: 404 });
  }
  const { slug } = await params;
  const family = readSourceFamily(slug);
  if (!family) return NextResponse.json({ error: 'Family not found' }, { status: 404 });

  let body: { items?: UploadItem[]; autoCreateTaxonomy?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'No items' }, { status: 400 });
  }

  // Optionally create bundles/categories/subcategories implied by the items
  // (used by the folder bulk-import) before validating against the family.
  if (body.autoCreateTaxonomy) ensureTaxonomy(slug, family, items);

  const written: string[] = [];
  const errors: string[] = [];

  for (const item of items) {
    const name = slugify(item.name);
    if (!name) { errors.push('Empty name'); continue; }
    if (!family.bundles.some(b => b.id === item.bundleId)) { errors.push(`${name}: unknown bundle`); continue; }
    if (!family.categories.some(c => c.id === item.categoryId)) { errors.push(`${name}: unknown category`); continue; }
    if (item.subcategoryId) {
      const cat = family.categories.find(c => c.id === item.categoryId)!;
      if (!cat.subcategories.some(s => s.id === item.subcategoryId)) { errors.push(`${name}: unknown subcategory`); continue; }
    }
    if (!isSafeSvg(item.svg)) { errors.push(`${name}: unsafe or invalid SVG`); continue; }

    const parts = [SOURCE_DIR, slug, item.bundleId, item.categoryId];
    if (item.subcategoryId) parts.push(item.subcategoryId);
    const dir = path.join(...parts);
    // guard against path traversal
    if (!dir.startsWith(path.join(SOURCE_DIR, slug))) { errors.push(`${name}: bad path`); continue; }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.svg`), item.svg.trim() + '\n');
    written.push(`${item.bundleId}/${item.categoryId}${item.subcategoryId ? '/' + item.subcategoryId : ''}/${name}.svg`);
  }

  return NextResponse.json({ ok: errors.length === 0, written, errors });
}
