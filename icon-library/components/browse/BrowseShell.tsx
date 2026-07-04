'use client';
import { useState, useMemo, useCallback, useEffect } from 'react';
import type { FamilyMeta, IconMeta, CategoryNode, IconVariant } from '@/types';
import { NavTree } from '@/components/nav/NavTree';
import { IconGrid } from '@/components/browse/IconGrid';
import { DetailPanel } from '@/components/detail/DetailPanel';
import { signIn, signOut } from 'next-auth/react';
import { useSearch } from '@/hooks/useSearch';
import type { GridDensity } from '@/taxonomy.config';

// Donation links — fill in your handles (leave '' to hide an option).
const DONATE = {
  buyMeACoffee: 'https://buymeacoffee.com/wEUfbad',
  kofi: 'https://ko-fi.com/rockerpower',
  paypal: '',
};

interface Props {
  families: FamilyMeta[];
  currentFamily: string;
  currentBundle: string;
  currentCategory: string;
  allIcons: IconMeta[];       // all icons for current family
  categoryIcons: IconMeta[];  // icons for current family+bundle+category
  category: CategoryNode | null;
  family: FamilyMeta;
}

export function BrowseShell({
  families, currentFamily, currentBundle, currentCategory,
  allIcons, categoryIcons, category, family,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [density, setDensity] = useState<GridDensity>(28);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [donateOpen, setDonateOpen] = useState(false);

  // Auth session + Pro entitlement.
  const [session, setSession] = useState<{ email: string; tier: 'free' | 'pro' } | null>(null);
  // Delivered Pro vectors, keyed by icon id (from /api/pro/<slug>).
  const [proVectors, setProVectors] = useState<Record<string, IconVariant[]>>({});
  const entitled = session?.tier === 'pro';

  // Hydrate search + selected icon from the URL query string (shareable links).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q');
    const icon = p.get('icon');
    if (q) setSearch(q);
    if (icon && allIcons.some(ic => ic.id === icon)) setSelectedId(icon);
    // Only on mount / route change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFamily, currentBundle, currentCategory]);

  // Reflect search + selection into the URL without triggering an RSC refetch.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (search.trim()) p.set('q', search); else p.delete('q');
    if (selectedId) p.set('icon', selectedId); else p.delete('icon');
    const qs = p.toString();
    const next = window.location.pathname + (qs ? `?${qs}` : '');
    window.history.replaceState(null, '', next);
  }, [search, selectedId]);

  const selectedIcon = useMemo(
    () => allIcons.find(ic => ic.id === selectedId) ?? null,
    [allIcons, selectedId]
  );

  const searchResults = useSearch(allIcons, search, currentBundle);
  const isSearching = search.trim().length > 0;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1700);
  }, []);

  const handleSelect = (id: string) => setSelectedId(prev => prev === id ? null : id);
  const handleClose = () => setSelectedId(null);

  // Fetch entitled Pro vectors for this family and patch the grid.
  const loadProVectors = useCallback(async () => {
    try {
      const res = await fetch(`/api/pro/${currentFamily}`);
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, IconVariant[]> = {};
      for (const ic of data.icons as { name: string; variants: IconVariant[] }[]) {
        map[`${family.id}__${ic.name}`] = ic.variants;
      }
      setProVectors(map);
    } catch { /* ignore */ }
  }, [currentFamily, family.id]);

  // On mount: load session; if entitled, deliver Pro vectors. Also handle the
  // Stripe checkout return (?checkout=success&session_id=...).
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('checkout') === 'success' && params.get('session_id')) {
          await fetch('/api/checkout/confirm', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: params.get('session_id') }),
          });
          params.delete('checkout'); params.delete('session_id');
          const qs = params.toString();
          window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
        }
        const res = await fetch('/api/session');
        const data = await res.json();
        setSession(data.session);
        if (data.session?.tier === 'pro') loadProVectors();
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFamily]);

  // Auth.js handles the OAuth redirect flow; callbackUrl returns here.
  const login = useCallback(() => {
    signIn('github', { callbackUrl: window.location.href });
  }, []);

  const logout = useCallback(() => {
    signOut({ callbackUrl: window.location.href });
  }, []);

  // Called by DetailPanel after a successful (mock) unlock: refresh session +
  // deliver the now-entitled Pro vectors so the grid unlocks too.
  const handleUnlocked = useCallback(async () => {
    try {
      const res = await fetch('/api/session');
      const data = await res.json();
      setSession(data.session);
    } catch { /* ignore */ }
    loadProVectors();
  }, [loadProVectors]);

  // Resolve variants + lock state for an icon, honoring delivered Pro vectors.
  const resolveVariants = (ic: IconMeta): IconVariant[] => proVectors[ic.id] ?? ic.variants;
  const isLocked = (ic: IconMeta): boolean => ic.tier === 'pro' && !proVectors[ic.id];

  // Group displayed icons into sections for browse mode.
  // - Single category: group by subcategory.
  // - "All" (no category): group by category.
  const subcategories = category?.subcategories ?? [];
  const browseSections = useMemo(() => {
    if (!category) {
      // "All" view: one section per family category, in taxonomy order.
      const sections = family.categories.map(cat => ({
        name: cat.name,
        icons: categoryIcons.filter(ic => ic.categoryId === cat.id),
      })).filter(s => s.icons.length > 0);
      const known = new Set(family.categories.map(c => c.id));
      const loose = categoryIcons.filter(ic => !known.has(ic.categoryId));
      if (loose.length > 0) sections.push({ name: 'Other', icons: loose });
      return sections;
    }
    if (subcategories.length === 0) return [{ name: null, icons: categoryIcons }];
    const sections = subcategories.map(sub => ({
      name: sub.name,
      icons: categoryIcons.filter(ic => ic.subcategoryId === sub.id),
    })).filter(s => s.icons.length > 0);
    // icons without subcategory
    const loose = categoryIcons.filter(ic => !ic.subcategoryId);
    if (loose.length > 0) sections.push({ name: 'Other', icons: loose });
    return sections;
  }, [category, categoryIcons, subcategories, family.categories]);

  const bundle = family.bundles.find(b => b.id === currentBundle);
  const licenseId = family.license;

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--background)', color: 'var(--foreground)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ flex: '0 0 228px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--background)' }}>
        <div style={{ flexShrink: 0, height: 56, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.01em' }}>Icons</span>
        </div>
        <NavTree
          families={families}
          currentFamily={currentFamily}
          currentBundle={currentBundle}
          currentCategory={currentCategory}
        />
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <header style={{ flexShrink: 0, height: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', borderBottom: '1px solid var(--border)' }}>
          {/* Search */}
          <div style={{ flex: 1, position: 'relative', maxWidth: 480 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-2)', fontSize: 14, pointerEvents: 'none' }}>⌕</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${family.name}…`}
              style={{ width: '100%', height: 36, padding: '0 36px 0 34px', background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--foreground)', fontSize: 13.5, outline: 'none' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', height: 22, width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', border: 'none', borderRadius: 5, color: 'var(--muted)', cursor: 'pointer' }}>×</button>
            )}
          </div>
          {/* Density */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {([24, 28, 32] as GridDensity[]).map((d, i) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                style={{ height: 32, width: 36, fontSize: 10.5, fontFamily: 'monospace', fontWeight: 600, background: density === d ? 'var(--surface-2)' : 'transparent', color: density === d ? 'var(--foreground)' : 'var(--muted-2)', border: 'none', borderRight: i < 2 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Donate */}
          <button onClick={() => setDonateOpen(true)} title="Support this project" style={{ height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
            Donate
          </button>

          {/* Account */}
          {session ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {entitled && <span style={{ height: 22, display: 'inline-flex', alignItems: 'center', padding: '0 8px', borderRadius: 6, background: 'var(--pro, #7C6AE8)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '.06em' }}>PRO</span>}
              <span title={session.email} style={{ fontSize: 12.5, color: 'var(--muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.email}</span>
              <button onClick={logout} style={{ height: 32, padding: '0 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>Sign out</button>
            </div>
          ) : (
            <button onClick={login} style={{ height: 32, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              Sign in
            </button>
          )}
        </header>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflow: 'hidden' }}>
            {isSearching ? (
              /* Search results */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flexShrink: 0, padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 6 }}>Search results</div>
                  <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500, fontStyle: 'italic', letterSpacing: '-.01em', lineHeight: 1.05 }}>
                    &ldquo;{search}&rdquo;{' '}
                    <span style={{ fontStyle: 'normal', color: 'var(--muted-2)', fontSize: 18 }}>· {searchResults.length}</span>
                  </h1>
                </div>
                <div style={{ flex: 1, overflow: 'hidden', padding: '16px 20px' }}>
                  <IconGrid icons={searchResults} bundleId={currentBundle} density={density} selectedId={selectedId} onSelect={handleSelect} />
                </div>
              </div>
            ) : (
              /* Browse view */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flexShrink: 0, padding: '20px 24px 14px' }}>
                  {/* Breadcrumb */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 11, fontFamily: 'monospace', letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted-2)' }}>
                    <span>Icons</span><span>›</span>
                    <span>{family.name}</span><span>›</span>
                    <span>{bundle?.name}</span><span>›</span>
                    <span style={{ color: 'var(--foreground)', fontWeight: 700 }}>{category?.name ?? 'All'}</span>
                  </div>

                  {/* Title */}
                  <h1 style={{ margin: 0, fontSize: 34, fontWeight: 500, letterSpacing: '-.02em', lineHeight: 1 }}>
                    {category?.name ?? 'All Icons'}
                  </h1>

                  {/* Meta row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, paddingBottom: 14, borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--muted)' }}>
                    <span><strong style={{ color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{categoryIcons.length}</strong> icons</span>
                    <span style={{ width: 1, height: 12, background: 'var(--border-2)' }} />
                    <span>by{' '}
                      {family.authors.map((a, i) => (
                        <span key={i}>{i > 0 ? ', ' : ' '}
                          {a.url ? <a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'var(--foreground)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 3 }}>{a.name}</a> : <strong style={{ color: 'var(--foreground)' }}>{a.name}</strong>}
                        </span>
                      ))}
                    </span>
                    <span style={{ width: 1, height: 12, background: 'var(--border-2)' }} />
                    <span>{licenseId.toUpperCase()}</span>
                  </div>
                </div>

                {/* Subcategory sections + grid */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 40px' }}>
                  {browseSections.map((sec, si) => (
                    <div key={si} style={{ marginTop: 22 }}>
                      {sec.name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted)' }}>{sec.name}</span>
                          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted-2)' }}>{sec.icons.length}</span>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${density === 24 ? 78 : density === 28 ? 92 : 106}px, 1fr))`, gap: 6 }}>
                        {sec.icons.map(ic => {
                          const vlist = resolveVariants(ic);
                          const variant = vlist.find(v => v.bundleId === currentBundle) ?? vlist[0];
                          if (!variant) return null;
                          const active = ic.id === selectedId;
                          const locked = isLocked(ic);
                          return (
                            <button
                              key={ic.id}
                              onClick={() => handleSelect(ic.id)}
                              title={locked ? `${ic.name} · Pro` : ic.name}
                              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 8px', minHeight: density === 24 ? 78 : density === 28 ? 92 : 106, borderRadius: 12, cursor: 'pointer', border: `1px solid ${active ? 'var(--border-2)' : 'transparent'}`, background: active ? 'var(--surface-2)' : 'transparent', color: 'var(--foreground)', transition: 'background .1s, border-color .1s' }}
                              className="hover:bg-[var(--surface-2)]"
                            >
                              {locked && (
                                <span title="Pro" style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, background: 'var(--pro, #7C6AE8)', color: '#fff', fontSize: 8 }}>
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                                </span>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: density, opacity: locked ? .32 : 1 }}>
                                {locked ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" width={density} height={density} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" width={density} height={density} viewBox={variant.viewBox}
                                    fill={variant.strokeBased ? 'none' : 'currentColor'}
                                    stroke={variant.strokeBased ? 'currentColor' : 'none'}
                                    strokeWidth={variant.strokeBased ? 2 : undefined}
                                    strokeLinecap={variant.strokeBased ? 'round' : undefined}
                                    strokeLinejoin={variant.strokeBased ? 'round' : undefined}
                                    dangerouslySetInnerHTML={{ __html: variant.paths.map(p => `<${p.tag} ${Object.entries(p.attrs).map(([k,v]) => `${k}="${v}"`).join(' ')}/>`).join('') }}
                                  />
                                )}
                              </div>
                              <span style={{ marginTop: 8, fontSize: 9, fontFamily: 'monospace', color: 'var(--muted-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' }}>
                                {ic.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedIcon && (
            <DetailPanel
              icon={selectedIcon}
              familySlug={currentFamily}
              activeBundleId={currentBundle}
              signedIn={!!session}
              unlockedVariants={proVectors[selectedIcon.id] ?? null}
              onRequestLogin={login}
              onUnlocked={handleUnlocked}
              onClose={handleClose}
              onToast={showToast}
            />
          )}
        </div>
      </div>

      {/* Donate modal */}
      {donateOpen && (
        <div onClick={() => setDonateOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 340, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Support this project</div>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>If these icons help you, consider a small donation. Thank you!</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                { label: 'Buy Me a Coffee', href: DONATE.buyMeACoffee, bg: '#FFDD00', fg: '#000' },
                { label: 'Ko-fi', href: DONATE.kofi, bg: '#13C3FF', fg: '#fff' },
                { label: 'PayPal', href: DONATE.paypal, bg: '#003087', fg: '#fff' },
              ] as const).filter(o => o.href && !o.href.includes('YOUR_HANDLE')).map(o => (
                <a key={o.label} href={o.href} target="_blank" rel="noreferrer" style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: o.bg, color: o.fg, fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>{o.label}</a>
              ))}
              {[DONATE.buyMeACoffee, DONATE.kofi, DONATE.paypal].every(h => h.includes('YOUR_HANDLE')) && (
                <div style={{ fontSize: 12, color: 'var(--muted-2)', textAlign: 'center', padding: '8px 0' }}>No donation links configured yet.</div>
              )}
            </div>
            <button onClick={() => setDonateOpen(false)} style={{ marginTop: 14, width: '100%', height: 36, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="toast-in"
          style={{ position: 'fixed', bottom: 24, left: '50%', zIndex: 99, display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', background: 'var(--foreground)', color: 'var(--background)', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.4)' }}
        >
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
