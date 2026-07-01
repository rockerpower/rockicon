import { notFound } from 'next/navigation';
import { isStudioEnabled, listSourceFamilies } from '@/lib/studio';
import { StudioShell } from '@/components/studio/StudioShell';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Studio · Icon Library',
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  if (!isStudioEnabled()) notFound();
  const families = listSourceFamilies();
  return <StudioShell families={families} />;
}
