import fs from 'fs';
import path from 'path';
import type { FamilyMeta, IconMeta, PublicFamilyIndex } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'public', 'icons-data');

function readIndex(familySlug: string): PublicFamilyIndex | null {
  const p = path.join(DATA_DIR, familySlug, 'index.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function getAllFamilySlugs(): string[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

export function getFamilyIndex(slug: string): PublicFamilyIndex | null {
  return readIndex(slug);
}

export function getPublishedFamilies(): FamilyMeta[] {
  return getAllFamilySlugs()
    .map(slug => readIndex(slug)?.family)
    .filter((f): f is FamilyMeta => !!f && f.status === 'published');
}

export function getCategoryIcons(
  familySlug: string,
  bundleId: string,
  categoryId: string
): IconMeta[] {
  const idx = readIndex(familySlug);
  if (!idx) return [];
  return idx.icons.filter(
    ic => ic.variants.some(v => v.bundleId === bundleId) && ic.categoryId === categoryId
  );
}

export function getDefaultRoute(): { family: string; bundle: string; category: string } | null {
  const families = getPublishedFamilies();
  if (!families.length) return null;
  const fam = families[0];
  const bundle = fam.bundles[0];
  const category = fam.categories[0];
  if (!bundle || !category) return null;
  return { family: fam.slug, bundle: bundle.id, category: category.id };
}
