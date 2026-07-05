import fs from 'fs';
import path from 'path';
import type { FamilyMeta, PathNode } from '@/types';
import { normalizeSvg } from './svg-normalize';

const SOURCE_DIR = path.join(process.cwd(), 'icons-source');

export function isStudioEnabled(): boolean {
  // Studio is a local authoring tool — never expose it in production builds.
  return process.env.NODE_ENV !== 'production';
}

export interface FamilySummary {
  slug: string;
  name: string;
  status: FamilyMeta['status'];
  iconCount: number;
}

function countSvgs(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) n += countSvgs(p);
    else if (entry.name.endsWith('.svg')) n += 1;
  }
  return n;
}

export function listSourceFamilies(): FamilySummary[] {
  if (!fs.existsSync(SOURCE_DIR)) return [];
  const out: FamilySummary[] = [];
  for (const entry of fs.readdirSync(SOURCE_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(SOURCE_DIR, entry.name, 'family.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta: FamilyMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      // Count unique icon names across bundles (approx: svgs in first bundle).
      const firstBundle = meta.bundles[0];
      const bundleDir = firstBundle ? path.join(SOURCE_DIR, entry.name, firstBundle.id) : '';
      out.push({
        slug: entry.name,
        name: meta.name,
        status: meta.status,
        iconCount: bundleDir ? countSvgs(bundleDir) : 0,
      });
    } catch {
      // skip malformed family.json
    }
  }
  return out;
}

export function readSourceFamily(slug: string): FamilyMeta | null {
  const metaPath = path.join(SOURCE_DIR, slug, 'family.json');
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

export interface SourceIcon {
  name: string;            // filename without .svg (canonical id within family)
  categoryId: string;
  subcategoryId?: string;
  bundles: string[];       // bundle ids this icon exists in
  viewBox: string;         // preview (from first bundle)
  paths: PathNode[];
  strokeBased: boolean;
}

// Scan icons-source/<slug>/<bundle>/<cat>/[<sub>/]<name>.svg and collapse
// same-name files across bundles into one SourceIcon.
export function listSourceIcons(slug: string): SourceIcon[] {
  const meta = readSourceFamily(slug);
  if (!meta) return [];
  const map = new Map<string, SourceIcon>();

  for (const bundle of meta.bundles) {
    const bundleDir = path.join(SOURCE_DIR, slug, bundle.id);
    if (!fs.existsSync(bundleDir)) continue;
    for (const catEntry of fs.readdirSync(bundleDir, { withFileTypes: true })) {
      if (!catEntry.isDirectory()) continue;
      const catId = catEntry.name;
      const catDir = path.join(bundleDir, catId);
      for (const sub of fs.readdirSync(catDir, { withFileTypes: true })) {
        if (sub.isDirectory()) {
          const subId = sub.name;
          const subDir = path.join(catDir, subId);
          for (const f of fs.readdirSync(subDir)) {
            if (f.endsWith('.svg')) collect(f, subDir, catId, subId, bundle.id, bundle.strokeBased);
          }
        } else if (sub.name.endsWith('.svg')) {
          collect(sub.name, catDir, catId, undefined, bundle.id, bundle.strokeBased);
        }
      }
    }
  }

  function collect(file: string, dir: string, catId: string, subId: string | undefined, bundleId: string, strokeBased: boolean) {
    const name = file.replace(/\.svg$/, '');
    const existing = map.get(name);
    if (existing) {
      if (!existing.bundles.includes(bundleId)) existing.bundles.push(bundleId);
    } else {
      let viewBox = '0 0 24 24', paths: PathNode[] = [];
      try { ({ viewBox, paths } = normalizeSvg(fs.readFileSync(path.join(dir, file), 'utf8'))); } catch { /* keep defaults */ }
      map.set(name, { name, categoryId: catId, subcategoryId: subId, bundles: [bundleId], viewBox, paths, strokeBased });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function writeSourceFamily(slug: string, meta: FamilyMeta): void {
  const dir = path.join(SOURCE_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  const metaPath = path.join(dir, 'family.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
}

const DATA_OUT_DIR = path.join(process.cwd(), 'public', 'icons-data');
const SLUG_RE = /^[a-z0-9-]+$/;

// Reject empty/traversal slugs and assert the resolved path stays inside base.
function safeChild(base: string, name: string): string | null {
  if (!name || !SLUG_RE.test(name)) return null;
  const resolved = path.resolve(base, name);
  if (resolved !== path.join(base, name) || !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

// Delete a family: its source folder and any built public output. Returns false
// if the slug is invalid or the family doesn't exist.
export function deleteSourceFamily(slug: string): boolean {
  const srcDir = safeChild(SOURCE_DIR, slug);
  if (!srcDir || !fs.existsSync(srcDir)) return false;
  fs.rmSync(srcDir, { recursive: true, force: true });
  const outDir = safeChild(DATA_OUT_DIR, slug);
  if (outDir && fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  return true;
}

// Delete a single icon (all its .svg files across bundles/categories) and strip
// its overrides entry. Returns the number of files removed (0 = not found).
export function deleteSourceIcon(slug: string, name: string): number {
  const srcDir = safeChild(SOURCE_DIR, slug);
  if (!srcDir) return 0;
  const meta = readSourceFamily(slug);
  if (!meta || !name || !SLUG_RE.test(name)) return 0;

  const source = listSourceIcons(slug).find(ic => ic.name === name);
  if (!source) return 0;

  let removed = 0;
  for (const bundleId of source.bundles) {
    const parts = [srcDir, bundleId, source.categoryId];
    if (source.subcategoryId) parts.push(source.subcategoryId);
    parts.push(`${name}.svg`);
    const filePath = path.join(...parts);
    if (filePath.startsWith(srcDir + path.sep) && fs.existsSync(filePath)) {
      fs.rmSync(filePath);
      removed++;
    }
  }

  if (meta.overrides?.[name]) {
    const { [name]: _drop, ...rest } = meta.overrides;
    meta.overrides = Object.keys(rest).length ? rest : undefined;
    writeSourceFamily(slug, meta);
  }

  return removed;
}
