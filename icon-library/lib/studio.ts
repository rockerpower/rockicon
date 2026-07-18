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

// ── Raw (non-collapsed) folder tree ──────────────────────────────────────────
// Powers the Studio file-manager: reflects the actual on-disk layout
// icons-source/<slug>/<bundle>/<category>/[<subcategory>/]<name>.svg without
// collapsing same-named files across bundles (which listSourceIcons does).
export interface TreeIcon {
  name: string;
  viewBox: string;
  paths: PathNode[];
  strokeBased: boolean;
}
export interface TreeSub { id: string; icons: TreeIcon[] }
export interface TreeCategory { id: string; icons: TreeIcon[]; subs: TreeSub[] }
export interface TreeBundle { id: string; categories: TreeCategory[] }
export interface Inconsistency {
  name: string;
  placements: { bundleId: string; categoryId: string; subcategoryId?: string }[];
}
export interface SourceTree {
  bundles: TreeBundle[];
  inconsistencies: Inconsistency[];
}

function readTreeIcon(dir: string, file: string, strokeBased: boolean): TreeIcon {
  const name = file.replace(/\.svg$/, '');
  let viewBox = '0 0 24 24', paths: PathNode[] = [];
  try { ({ viewBox, paths } = normalizeSvg(fs.readFileSync(path.join(dir, file), 'utf8'))); } catch { /* keep defaults */ }
  return { name, viewBox, paths, strokeBased };
}

export function listSourceTree(slug: string): SourceTree {
  const meta = readSourceFamily(slug);
  if (!meta) return { bundles: [], inconsistencies: [] };

  const bundles: TreeBundle[] = [];
  // name → set of "bundleId::categoryId::subcategoryId" placements, for the
  // cross-bundle inconsistency scan.
  const placements = new Map<string, Inconsistency['placements']>();
  const track = (name: string, bundleId: string, categoryId: string, subcategoryId?: string) => {
    const arr = placements.get(name) ?? [];
    arr.push({ bundleId, categoryId, subcategoryId });
    placements.set(name, arr);
  };

  for (const bundle of meta.bundles) {
    const bundleDir = path.join(SOURCE_DIR, slug, bundle.id);
    const categories: TreeCategory[] = [];
    if (fs.existsSync(bundleDir)) {
      for (const catEntry of fs.readdirSync(bundleDir, { withFileTypes: true })) {
        if (!catEntry.isDirectory()) continue;
        const catId = catEntry.name;
        const catDir = path.join(bundleDir, catId);
        const icons: TreeIcon[] = [];
        const subs: TreeSub[] = [];
        for (const sub of fs.readdirSync(catDir, { withFileTypes: true })) {
          if (sub.isDirectory()) {
            const subId = sub.name;
            const subDir = path.join(catDir, subId);
            const subIcons: TreeIcon[] = [];
            for (const f of fs.readdirSync(subDir)) {
              if (!f.endsWith('.svg')) continue;
              subIcons.push(readTreeIcon(subDir, f, bundle.strokeBased));
              track(f.replace(/\.svg$/, ''), bundle.id, catId, subId);
            }
            subIcons.sort((a, b) => a.name.localeCompare(b.name));
            subs.push({ id: subId, icons: subIcons });
          } else if (sub.name.endsWith('.svg')) {
            icons.push(readTreeIcon(catDir, sub.name, bundle.strokeBased));
            track(sub.name.replace(/\.svg$/, ''), bundle.id, catId, undefined);
          }
        }
        icons.sort((a, b) => a.name.localeCompare(b.name));
        subs.sort((a, b) => a.id.localeCompare(b.id));
        categories.push({ id: catId, icons, subs });
      }
    }
    categories.sort((a, b) => a.id.localeCompare(b.id));
    bundles.push({ id: bundle.id, categories });
  }

  // A name is inconsistent if its (category, subcategory) placement differs
  // across the bundles it appears in.
  const inconsistencies: Inconsistency[] = [];
  for (const [name, places] of placements) {
    if (places.length < 2) continue;
    const key = (p: Inconsistency['placements'][number]) => `${p.categoryId}::${p.subcategoryId ?? ''}`;
    const distinct = new Set(places.map(key));
    if (distinct.size > 1) inconsistencies.push({ name, placements: places });
  }
  inconsistencies.sort((a, b) => a.name.localeCompare(b.name));

  return { bundles, inconsistencies };
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

// A single file's location within a family: bundle/category/[subcategory]/name.
export interface FileLoc {
  bundleId: string;
  categoryId: string;
  subcategoryId?: string;
  name: string;
}
export type FileTarget = Omit<FileLoc, 'name'>;

// Validate that every slug segment of a location is well-formed and that the
// bundle/category/subcategory actually exist in family.json. Returns the
// resolved absolute file path, or null if invalid.
function resolveLocPath(
  srcDir: string, meta: FamilyMeta, bundleId: string, categoryId: string, subcategoryId: string | undefined, name: string
): string | null {
  if (![bundleId, categoryId, name].every(s => s && SLUG_RE.test(s))) return null;
  if (subcategoryId && !SLUG_RE.test(subcategoryId)) return null;
  if (!meta.bundles.some(b => b.id === bundleId)) return null;
  const cat = meta.categories.find(c => c.id === categoryId);
  if (!cat) return null;
  if (subcategoryId && !cat.subcategories.some(s => s.id === subcategoryId)) return null;
  const parts = [srcDir, bundleId, categoryId];
  if (subcategoryId) parts.push(subcategoryId);
  parts.push(`${name}.svg`);
  const resolved = path.join(...parts);
  if (!resolved.startsWith(srcDir + path.sep)) return null;
  return resolved;
}

// Move exactly ONE file (this weight only) to a different bundle/category/
// subcategory — the file-manager's move primitive. Refuses to overwrite an
// existing destination. Returns { ok } or an error string.
export function moveSourceFile(slug: string, from: FileLoc, to: FileTarget): { ok: boolean; error?: string } {
  const srcDir = safeChild(SOURCE_DIR, slug);
  if (!srcDir) return { ok: false, error: 'Invalid family' };
  const meta = readSourceFamily(slug);
  if (!meta) return { ok: false, error: 'Family not found' };

  const fromPath = resolveLocPath(srcDir, meta, from.bundleId, from.categoryId, from.subcategoryId, from.name);
  if (!fromPath) return { ok: false, error: 'Invalid source' };
  if (!fs.existsSync(fromPath)) return { ok: false, error: 'Source file not found' };

  const toPath = resolveLocPath(srcDir, meta, to.bundleId, to.categoryId, to.subcategoryId, from.name);
  if (!toPath) return { ok: false, error: 'Invalid destination (bundle/category must exist)' };
  if (fromPath === toPath) return { ok: false, error: 'Already in that location' };
  if (fs.existsSync(toPath)) return { ok: false, error: 'A file with this name already exists there' };

  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.renameSync(fromPath, toPath);
  return { ok: true };
}

// ── Taxonomy deletion (bundle / category / subcategory) ─────────────────────
// All three refuse to delete while any .svg still lives inside — the caller
// must move or delete the icons first. Folder(s) are removed from disk AND the
// entry is stripped from family.json in one shot.

// Delete a bundle: its folder icons-source/<slug>/<bundleId>/ plus the
// bundles[] entry. Refuses if the bundle still holds any icon.
export function deleteBundle(slug: string, bundleId: string): { ok: boolean; error?: string } {
  const srcDir = safeChild(SOURCE_DIR, slug);
  if (!srcDir) return { ok: false, error: 'Invalid family' };
  const meta = readSourceFamily(slug);
  if (!meta) return { ok: false, error: 'Family not found' };
  if (!SLUG_RE.test(bundleId) || !meta.bundles.some(b => b.id === bundleId)) return { ok: false, error: 'Bundle not found' };

  const dir = path.join(srcDir, bundleId);
  if (countSvgs(dir) > 0) return { ok: false, error: 'Bundle still has icons — move or delete them first' };
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  meta.bundles = meta.bundles.filter(b => b.id !== bundleId);
  writeSourceFamily(slug, meta);
  return { ok: true };
}

// Delete a category across ALL bundles (the category folder is replicated per
// bundle) plus the categories[] entry. Refuses if any icon remains anywhere.
export function deleteCategory(slug: string, categoryId: string): { ok: boolean; error?: string } {
  const srcDir = safeChild(SOURCE_DIR, slug);
  if (!srcDir) return { ok: false, error: 'Invalid family' };
  const meta = readSourceFamily(slug);
  if (!meta) return { ok: false, error: 'Family not found' };
  if (!SLUG_RE.test(categoryId) || !meta.categories.some(c => c.id === categoryId)) return { ok: false, error: 'Category not found' };

  const dirs = meta.bundles.map(b => path.join(srcDir, b.id, categoryId));
  if (dirs.some(d => countSvgs(d) > 0)) return { ok: false, error: 'Category still has icons — move or delete them first' };
  for (const d of dirs) if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  meta.categories = meta.categories.filter(c => c.id !== categoryId);
  writeSourceFamily(slug, meta);
  return { ok: true };
}

// Delete a subcategory across ALL bundles plus the subcategories[] entry.
// Refuses if any icon remains in it.
export function deleteSubcategory(slug: string, categoryId: string, subId: string): { ok: boolean; error?: string } {
  const srcDir = safeChild(SOURCE_DIR, slug);
  if (!srcDir) return { ok: false, error: 'Invalid family' };
  const meta = readSourceFamily(slug);
  if (!meta) return { ok: false, error: 'Family not found' };
  const cat = meta.categories.find(c => c.id === categoryId);
  if (!SLUG_RE.test(categoryId) || !cat) return { ok: false, error: 'Category not found' };
  if (!SLUG_RE.test(subId) || !cat.subcategories.some(s => s.id === subId)) return { ok: false, error: 'Subcategory not found' };

  const dirs = meta.bundles.map(b => path.join(srcDir, b.id, categoryId, subId));
  if (dirs.some(d => countSvgs(d) > 0)) return { ok: false, error: 'Subcategory still has icons — move or delete them first' };
  for (const d of dirs) if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  cat.subcategories = cat.subcategories.filter(s => s.id !== subId);
  writeSourceFamily(slug, meta);
  return { ok: true };
}

// Delete exactly ONE file (this weight only). Returns true if removed.
export function deleteSourceFile(slug: string, loc: FileLoc): boolean {
  const srcDir = safeChild(SOURCE_DIR, slug);
  if (!srcDir) return false;
  const meta = readSourceFamily(slug);
  if (!meta) return false;
  const filePath = resolveLocPath(srcDir, meta, loc.bundleId, loc.categoryId, loc.subcategoryId, loc.name);
  if (!filePath || !fs.existsSync(filePath)) return false;
  fs.rmSync(filePath);
  return true;
}
