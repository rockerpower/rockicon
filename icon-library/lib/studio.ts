import fs from 'fs';
import path from 'path';
import type { FamilyMeta } from '@/types';

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
            if (f.endsWith('.svg')) collect(f, catId, subId, bundle.id);
          }
        } else if (sub.name.endsWith('.svg')) {
          collect(sub.name, catId, undefined, bundle.id);
        }
      }
    }
  }

  function collect(file: string, catId: string, subId: string | undefined, bundleId: string) {
    const name = file.replace(/\.svg$/, '');
    const existing = map.get(name);
    if (existing) {
      if (!existing.bundles.includes(bundleId)) existing.bundles.push(bundleId);
    } else {
      map.set(name, { name, categoryId: catId, subcategoryId: subId, bundles: [bundleId] });
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
