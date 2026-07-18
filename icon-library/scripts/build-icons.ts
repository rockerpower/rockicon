/**
 * build:icons — reads icons-source/, normalizes SVGs, emits public/icons-data/
 * Run: npx tsx scripts/build-icons.ts
 */
import fs from 'fs';
import path from 'path';
import type { FamilyMeta, IconMeta, IconVariant, PublicFamilyIndex } from '../types';
import { normalizeSvg } from '../lib/svg-normalize';

const ICONS_SOURCE = path.join(process.cwd(), 'icons-source');
const ICONS_OUT = path.join(process.cwd(), 'public', 'icons-data');

// ── Walk icons-source/<family>/<bundle>/<cat>/[<sub>/]<name>.svg ──────────

function walkFamily(familySlug: string, familyMeta: FamilyMeta): IconMeta[] {
  const familyDir = path.join(ICONS_SOURCE, familySlug);
  const iconMap = new Map<string, IconMeta>();

  for (const bundle of familyMeta.bundles) {
    const bundleDir = path.join(familyDir, bundle.id);
    if (!fs.existsSync(bundleDir)) continue;

    for (const catEntry of fs.readdirSync(bundleDir, { withFileTypes: true })) {
      if (!catEntry.isDirectory()) continue;
      const catId = catEntry.name;
      const catDef = familyMeta.categories.find(c => c.id === catId);
      const catDir = path.join(bundleDir, catId);

      for (const subEntry of fs.readdirSync(catDir, { withFileTypes: true })) {
        if (subEntry.isDirectory()) {
          // has subcategory level
          const subId = subEntry.name;
          const subDir = path.join(catDir, subId);
          for (const f of fs.readdirSync(subDir)) {
            if (!f.endsWith('.svg')) continue;
            processIcon({ f, dir: subDir, familyMeta, bundle, catId, subId, iconMap });
          }
        } else if (subEntry.name.endsWith('.svg')) {
          // icon directly in category (no subcategory)
          processIcon({ f: subEntry.name, dir: catDir, familyMeta, bundle, catId, subId: undefined, iconMap });
        }
      }
    }
  }

  return Array.from(iconMap.values());
}

interface ProcessArgs {
  f: string;
  dir: string;
  familyMeta: FamilyMeta;
  bundle: FamilyMeta['bundles'][number];
  catId: string;
  subId?: string;
  iconMap: Map<string, IconMeta>;
}

function processIcon({ f, dir, familyMeta, bundle, catId, subId, iconMap }: ProcessArgs) {
  const iconName = f.replace(/\.svg$/, '');
  const iconId = `${familyMeta.id}__${iconName}`;
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  const { viewBox, paths } = normalizeSvg(raw);

  const variant: IconVariant = {
    bundleId: bundle.id,
    viewBox,
    paths,
    strokeBased: bundle.strokeBased,
    strokeWidth: bundle.strokeWidth,
  };

  if (iconMap.has(iconId)) {
    iconMap.get(iconId)!.variants.push(variant);
  } else {
    const override = familyMeta.overrides?.[iconName];
    iconMap.set(iconId, {
      id: iconId,
      familyId: familyMeta.id,
      name: override?.name ?? iconName.replace(/-/g, ' '),
      categoryId: catId,
      subcategoryId: subId,
      tags: override?.tags ?? iconName.split('-'),
      tier: override?.tier ?? familyMeta.defaultTier,
      status: 'published',
      variants: [variant],
    });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

function buildFamily(familySlug: string) {
  const metaPath = path.join(ICONS_SOURCE, familySlug, 'family.json');
  if (!fs.existsSync(metaPath)) return;
  const familyMeta: FamilyMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  if (familyMeta.status !== 'published') {
    console.log(`  skip ${familySlug} (draft)`);
    return;
  }

  const icons = walkFamily(familySlug, familyMeta);
  const outDir = path.join(ICONS_OUT, familySlug);
  fs.mkdirSync(outDir, { recursive: true });

  // SECURITY INVARIANT: Pro vectors must never ship in the public index.
  // Strip path geometry for Pro icons — keep viewBox + strokeBased so the UI
  // can render a locked placeholder, but the actual paths stay server-side only.
  let proStripped = 0;
  const publicIcons: IconMeta[] = icons.map(icon => {
    if (icon.tier !== 'pro') return icon;
    proStripped++;
    return {
      ...icon,
      variants: icon.variants.map(v => ({ ...v, paths: [] })),
    };
  });

  const index: PublicFamilyIndex = { family: familyMeta, icons: publicIcons };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`  ${familySlug}: ${icons.length} icons (${proStripped} pro locked) → public/icons-data/${familySlug}/index.json`);
}

function main() {
  fs.mkdirSync(ICONS_OUT, { recursive: true });
  const families = fs.readdirSync(ICONS_SOURCE, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  console.log(`Building ${families.length} famil${families.length === 1 ? 'y' : 'ies'}…`);
  for (const fam of families) buildFamily(fam);

  // Prune orphaned output: public/icons-data dirs with no source family
  // (e.g. a family deleted in Studio) must not linger in the deployed catalog.
  const sourceSlugs = new Set(families);
  if (fs.existsSync(ICONS_OUT)) {
    for (const entry of fs.readdirSync(ICONS_OUT, { withFileTypes: true })) {
      if (entry.isDirectory() && !sourceSlugs.has(entry.name)) {
        fs.rmSync(path.join(ICONS_OUT, entry.name), { recursive: true, force: true });
        console.log(`  pruned orphaned output: ${entry.name}`);
      }
    }
  }

  console.log('Done.');
}

main();
