import { redirect } from 'next/navigation';
import { getDefaultRoute } from '@/lib/icons-data';

export default function Root() {
  const route = getDefaultRoute();
  if (!route) return <div style={{ padding: 40, color: 'white' }}>No icons found. Run <code>npm run build:icons</code> first.</div>;
  redirect(`/${route.family}/${route.bundle}/${route.category}`);
}
