import { notFound } from 'next/navigation';
import { getAllFamilySlugs, getFamilyIndex, getPublishedFamilies } from '@/lib/icons-data';
import { BrowseShell } from '@/components/browse/BrowseShell';
import type { Metadata } from 'next';

interface Params {
  family: string;
  bundle: string;
  category: string;
}

export async function generateStaticParams(): Promise<Params[]> {
  const params: Params[] = [];
  for (const slug of getAllFamilySlugs()) {
    const idx = getFamilyIndex(slug);
    if (!idx || idx.family.status !== 'published') continue;
    for (const bundle of idx.family.bundles) {
      // "__all__" virtual route
      params.push({ family: slug, bundle: bundle.id, category: '__all__' });
      for (const cat of idx.family.categories) {
        params.push({ family: slug, bundle: bundle.id, category: cat.id });
      }
    }
  }
  return params;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { family, bundle, category } = await params;
  const idx = getFamilyIndex(family);
  if (!idx) return {};
  const cat = idx.family.categories.find(c => c.id === category);
  return {
    title: `${cat?.name ?? 'All'} — ${idx.family.name} ${bundle} · Icon Library`,
  };
}

export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const { family: familySlug, bundle: bundleId, category: categoryId } = await params;

  const idx = getFamilyIndex(familySlug);
  if (!idx || idx.family.status !== 'published') notFound();

  const bundleDef = idx.family.bundles.find(b => b.id === bundleId);
  if (!bundleDef) notFound();

  const isAll = categoryId === '__all__';
  const category = isAll ? null : idx.family.categories.find(c => c.id === categoryId) ?? null;
  if (!isAll && !category) notFound();

  // Icons for this category+bundle
  const categoryIcons = isAll
    ? idx.icons.filter(ic => ic.variants.some(v => v.bundleId === bundleId))
    : idx.icons.filter(ic => ic.categoryId === categoryId && ic.variants.some(v => v.bundleId === bundleId));

  const families = getPublishedFamilies();

  return (
    <BrowseShell
      families={families}
      currentFamily={familySlug}
      currentBundle={bundleId}
      currentCategory={categoryId}
      allIcons={idx.icons}
      categoryIcons={categoryIcons}
      category={category}
      family={idx.family}
    />
  );
}
