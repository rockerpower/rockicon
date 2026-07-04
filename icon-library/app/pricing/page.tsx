import { PricingShell } from '@/components/pricing/PricingShell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing · Icon Library',
  description: 'Free and Pro plans for the icon library.',
};

export default function PricingPage() {
  return <PricingShell />;
}
