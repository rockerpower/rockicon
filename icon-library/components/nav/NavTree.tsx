'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { FamilyMeta } from '@/types';

interface Props {
  families: FamilyMeta[];
  currentFamily: string;
  currentBundle: string;
  currentCategory: string;
}

type MenuKey = 'family' | 'bundle' | 'category' | null;

export function NavTree({ families, currentFamily, currentBundle, currentCategory }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<MenuKey>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const family = families.find(f => f.slug === currentFamily) ?? families[0];
  const bundle = family?.bundles.find(b => b.id === currentBundle) ?? family?.bundles[0];

  const navigate = useCallback((f: string, b: string, c: string) => {
    setOpen(null);
    router.push(`/${f}/${b}/${c}`);
  }, [router]);

  const pickFamily = (f: FamilyMeta) => {
    const b = f.bundles[0];
    const c = f.categories[0];
    if (b && c) navigate(f.slug, b.id, c.id);
  };
  const pickBundle = (bundleId: string) => {
    const c = family?.categories[0];
    if (family && c) navigate(family.slug, bundleId, c.id);
  };
  const pickCategory = (categoryId: string) => {
    if (family && bundle) navigate(family.slug, bundle.id, categoryId);
  };

  const Crumb = ({ menuKey, label, accent, children }: { menuKey: MenuKey; label: string; accent?: boolean; children: React.ReactNode }) => (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => o === menuKey ? null : menuKey)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '13px 16px', cursor: 'pointer',
          background: 'transparent', border: 'none',
          color: accent ? 'var(--accent)' : 'var(--muted)', fontWeight: accent ? 600 : 400,
          boxShadow: accent ? 'inset 0 -2px 0 var(--accent)' : undefined,
        }}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open === menuKey && (
        <div style={{ position: 'absolute', top: 'calc(100% - 2px)', left: 8, zIndex: 50, background: 'var(--background)', border: '0.5px solid #C7C7C7', borderRadius: 'var(--radius)', boxShadow: '0 14px 34px -14px rgba(0,0,0,.3)', minWidth: 170, padding: 5 }}>
          {children}
        </div>
      )}
    </div>
  );

  const Option = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius)', background: 'transparent', border: 'none', color: 'var(--foreground)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span>{label}</span>
      {active && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
    </button>
  );

  if (!family || !bundle) return null;

  return (
    <div ref={rootRef} style={{ position: 'sticky', top: 57, zIndex: 30, background: 'var(--background)', display: 'flex', alignItems: 'center', padding: '0 40px', borderBottom: '1px solid var(--hairline)' }}>
      <span style={{ fontSize: 12, color: 'var(--muted-2)', paddingRight: 22 }}>Library</span>

      <Crumb menuKey="family" label={family.name}>
        {families.map(f => (
          <Option key={f.slug} label={f.name} active={f.slug === family.slug} onClick={() => pickFamily(f)} />
        ))}
      </Crumb>
      <span style={{ color: 'var(--border)' }}>/</span>

      <Crumb menuKey="bundle" label={bundle.name}>
        {family.bundles.map(b => (
          <Option key={b.id} label={b.name} active={b.id === bundle.id} onClick={() => pickBundle(b.id)} />
        ))}
      </Crumb>
      <span style={{ color: 'var(--border)' }}>/</span>

      <Crumb menuKey="category" label={currentCategory === '__all__' ? 'All' : (family.categories.find(c => c.id === currentCategory)?.name ?? 'All')} accent>
        <Option label="All" active={currentCategory === '__all__'} onClick={() => pickCategory('__all__')} />
        {family.categories.map(c => (
          <Option key={c.id} label={c.name} active={c.id === currentCategory} onClick={() => pickCategory(c.id)} />
        ))}
      </Crumb>
    </div>
  );
}
