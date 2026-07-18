export type LicenseId = string;

export interface Credit {
  name: string;
  url?: string;
}

export interface BundleDef {
  id: string;
  name: string;
  strokeBased: boolean;
  predefined: boolean;
  defaultTier?: 'free' | 'pro';
  strokeWidth?: number; // hand-drawn weight this bundle's source SVGs are calibrated for
}

export interface SubcategoryNode {
  id: string;
  name: string;
}

export interface CategoryNode {
  id: string;
  name: string;
  subcategories: SubcategoryNode[];
}

// Per-icon authoring overrides, keyed by icon name (filename without .svg).
// Category/subcategory come from folder placement; only display + tier + tags
// are overridable here.
export interface IconOverride {
  name?: string;
  tier?: 'free' | 'pro';
  tags?: string[];
}

export interface FamilyMeta {
  id: string;
  name: string;
  slug: string;
  authors: Credit[];
  license: LicenseId;
  licenseByTier?: { free?: LicenseId; pro?: LicenseId };
  description?: string;
  coverUrl?: string;
  version?: string;
  baseGrid?: number;
  defaultTier: 'free' | 'pro';
  status: 'draft' | 'published';
  bundles: BundleDef[];
  categories: CategoryNode[];
  overrides?: Record<string, IconOverride>;
}

export interface PathNode {
  tag: 'path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon' | 'ellipse';
  attrs: Record<string, string | number>;
}

export interface IconVariant {
  bundleId: string;
  viewBox: string;
  paths: PathNode[];       // free: populated; pro: empty in public index
  previewPng?: string;     // pro only: path to locked preview
  strokeBased: boolean;
  strokeWidth?: number;    // bundle-derived — see BundleDef.strokeWidth
}

export interface IconMeta {
  id: string;
  familyId: string;
  name: string;
  categoryId: string;
  subcategoryId?: string;
  tags: string[];
  tier: 'free' | 'pro';
  status?: 'draft' | 'published';
  variants: IconVariant[];
}

// Public index shape (emitted by build:icons)
export interface PublicFamilyIndex {
  family: Omit<FamilyMeta, 'categories'> & { categories: CategoryNode[] };
  icons: IconMeta[];
}

// Resolved tier (icon → bundle → family)
export function resolveTier(
  icon: Pick<IconMeta, 'tier'>,
  bundle: Pick<BundleDef, 'defaultTier'> | undefined,
  family: Pick<FamilyMeta, 'defaultTier'>
): 'free' | 'pro' {
  return icon.tier ?? bundle?.defaultTier ?? family.defaultTier;
}
