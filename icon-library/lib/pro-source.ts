import fs from 'fs';
import path from 'path';
import type { IconVariant } from '../types';
import { normalizeSvg } from './svg-normalize';
import { readSourceFamily, listSourceIcons } from './studio';

const SOURCE_DIR = path.join(process.cwd(), 'icons-source');

export interface ProIconPayload {
  name: string;
  displayName: string;
  variants: IconVariant[];
}

// Server-only: read the full vector geometry for a single Pro icon straight
// from icons-source (which never ships to the client). Returns null if the
// icon does not exist or is NOT actually a Pro icon (so this route can never
// be used to exfiltrate Free vectors — those are already public anyway).
export function readProIcon(slug: string, name: string): ProIconPayload | null {
  const family = readSourceFamily(slug);
  if (!family) return null;

  const override = family.overrides?.[name];
  const tier = override?.tier ?? family.defaultTier;
  if (tier !== 'pro') return null;

  const source = listSourceIcons(slug).find(ic => ic.name === name);
  if (!source) return null;

  const variants: IconVariant[] = [];
  for (const bundleId of source.bundles) {
    const bundle = family.bundles.find(b => b.id === bundleId);
    if (!bundle) continue;
    const parts = [SOURCE_DIR, slug, bundleId, source.categoryId];
    if (source.subcategoryId) parts.push(source.subcategoryId);
    parts.push(`${name}.svg`);
    const filePath = path.join(...parts);
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, 'utf8');
    const { viewBox, paths } = normalizeSvg(raw);
    variants.push({ bundleId, viewBox, paths, strokeBased: bundle.strokeBased });
  }

  if (variants.length === 0) return null;
  return {
    name,
    displayName: override?.name ?? name.replace(/-/g, ' '),
    variants,
  };
}

// Server-only: all Pro icons for a family, with full geometry. Used by the
// entitled batch-delivery endpoint so the grid can render real vectors.
export function readAllProIcons(slug: string): ProIconPayload[] {
  const family = readSourceFamily(slug);
  if (!family) return [];
  const out: ProIconPayload[] = [];
  for (const src of listSourceIcons(slug)) {
    const tier = family.overrides?.[src.name]?.tier ?? family.defaultTier;
    if (tier !== 'pro') continue;
    const icon = readProIcon(slug, src.name);
    if (icon) out.push(icon);
  }
  return out;
}
