'use client';
import { useState, useMemo, useCallback, useEffect } from 'react';
import type { FamilyMeta, IconMeta, CategoryNode, IconVariant } from '@/types';
import { NavTree } from '@/components/nav/NavTree';
import { IconGrid } from '@/components/browse/IconGrid';
import { DetailPanel } from '@/components/detail/DetailPanel';
import { signIn, signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { PricingCards } from '@/components/pricing/PricingCards';
import JSZip from 'jszip';
import { buildSvgMarkup } from '@/lib/svg-render';
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
  const [signinOpen, setSigninOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);

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

  // Bulk select + zip download
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const clearSel = () => setSelected(new Set());
  const exitSelect = () => { setSelectMode(false); clearSel(); };

  const downloadZip = useCallback(async () => {
    if (selected.size === 0) return;
    const zip = new JSZip();
    for (const id of selected) {
      const ic = allIcons.find(i => i.id === id);
      if (!ic || ic.tier === 'pro') continue; // skip locked (no vectors client-side)
      const v = (proVectors[id] ?? ic.variants).find(x => x.bundleId === currentBundle) ?? ic.variants[0];
      if (!v || v.paths.length === 0) continue;
      zip.file(`${ic.name.replace(/\s+/g, '-')}.svg`, buildSvgMarkup(v, { size: 24, color: '#000000', strokeWidth: 2 }));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${currentFamily}-icons.zip`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast(`Downloaded ${selected.size} icons`);
    exitSelect();
  }, [selected, allIcons, proVectors, currentBundle, currentFamily, showToast]);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--background)', color: 'var(--foreground)', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, flexShrink: 0, height: 57, display: 'flex', alignItems: 'center', gap: 12, padding: '0 40px', borderBottom: '1px solid var(--hairline)', background: 'var(--background)' }}>
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.3px', marginRight: 10 }}>Icons</span>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 300, background: 'var(--surface-2)', padding: '9px 13px', color: 'var(--muted)', fontSize: 13, border: '0.5px solid #C7C7C7', borderRadius: 'var(--radius)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${family.name}…`}
            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: 13, color: 'var(--foreground)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--muted-2)', fontSize: 15, lineHeight: 1 }}>×</button>
          )}
        </div>

        {/* Size dropdown */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setSizeOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', padding: '9px 13px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius)', border: '0.5px solid #C7C7C7' }}>
            <span style={{ color: 'var(--muted)' }}>Size</span>
            <span style={{ fontWeight: 600 }}>{density}px</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ opacity: .5 }}><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {sizeOpen && (
            <>
              <div onClick={() => setSizeOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 91, background: 'var(--background)', border: '0.5px solid #C7C7C7', borderRadius: 'var(--radius)', boxShadow: '0 14px 34px -14px rgba(0,0,0,.3)', minWidth: 120, padding: 5 }}>
                {([24, 28, 32] as GridDensity[]).map(d => (
                  <button
                    key={d}
                    onClick={() => { setDensity(d); setSizeOpen(false); }}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius)', background: 'transparent', border: 'none', color: 'var(--foreground)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span>{d}px</span>
                    {density === d && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button onClick={() => selectMode ? exitSelect() : setSelectMode(true)} style={{ height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, background: selectMode ? 'var(--foreground)' : 'var(--surface-2)', border: '0.5px solid #C7C7C7', borderRadius: 'var(--radius)', color: selectMode ? 'var(--background)' : 'var(--foreground)', fontSize: 13, cursor: 'pointer' }}>
          {selectMode ? 'Done' : 'Select'}
        </button>

        <div style={{ flex: 1 }} />

        <button onClick={() => setPricingOpen(true)} style={{ background: 'transparent', border: 'none', padding: 0, fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--foreground)', cursor: 'pointer' }}>Pricing</button>

        <ThemeToggle />

        <span style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />

        {/* Donate (primary) */}
        <button onClick={() => setDonateOpen(true)} style={{ background: 'var(--foreground)', color: 'var(--background)', border: 'none', padding: '9px 16px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer', borderRadius: 'var(--radius)' }}>
          Donate
        </button>

        {/* Account */}
        {session ? (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setAccountOpen(o => !o)} title={session.email} style={{ position: 'relative', height: 32, width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', border: '0.5px solid #C7C7C7', borderRadius: '50%', color: 'var(--foreground)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
              {session.email.charAt(0)}
              {entitled && <span style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: '50%', background: 'var(--pro, #7C6AE8)', border: '2px solid var(--background)' }} />}
            </button>
            {accountOpen && (
              <>
                <div onClick={() => setAccountOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 91, width: 220, padding: 6, background: 'var(--background)', border: '0.5px solid #C7C7C7', borderRadius: 'var(--radius)', boxShadow: '0 12px 40px rgba(0,0,0,.4)' }}>
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.email}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted-2)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.06em' }}>{entitled ? 'Pro' : 'Free'} plan</div>
                  </div>
                  <button onClick={() => { setAccountOpen(false); logout(); }} style={{ width: '100%', textAlign: 'left', height: 34, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', borderRadius: 'var(--radius)', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }} className="hover:bg-[var(--surface-2)]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button onClick={() => setSigninOpen(true)} style={{ background: 'var(--surface-2)', color: 'var(--foreground)', padding: '9px 16px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer', borderRadius: 'var(--radius)', border: '0.5px solid #C7C7C7' }}>
            Sign in
          </button>
        )}
      </header>

      {/* Breadcrumb nav */}
      <NavTree
        families={families}
        currentFamily={currentFamily}
        currentBundle={currentBundle}
        currentCategory={currentCategory}
      />

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Content */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--background)', overflow: 'hidden' }}>
            {isSearching ? (
              /* Search results */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flexShrink: 0, padding: '36px 40px 16px', borderBottom: '1px solid var(--hairline)' }}>
                  <div style={{ fontSize: 13, color: 'var(--muted-2)', marginBottom: 12 }}>Search results</div>
                  <h1 style={{ margin: 0, fontWeight: 600, fontSize: 40, letterSpacing: '-1.4px', lineHeight: .95 }}>
                    &ldquo;{search}&rdquo;{' '}
                    <span style={{ color: 'var(--accent)' }}>· {searchResults.length}</span>
                  </h1>
                </div>
                <div style={{ flex: 1, overflow: 'hidden', padding: '16px 20px' }}>
                  <IconGrid icons={searchResults} bundleId={currentBundle} density={density} selectedId={selectedId} onSelect={handleSelect} />
                </div>
              </div>
            ) : (
              /* Browse view */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'end', padding: '36px 40px 26px', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--muted-2)', marginBottom: 12 }}>
                      Icons / {family.name} / {bundle?.name} / <span style={{ color: 'var(--accent)' }}>{category?.name ?? 'All'}</span>
                    </div>
                    <h1 style={{ margin: 0, fontWeight: 600, fontSize: 54, lineHeight: .95, letterSpacing: '-2px', position: 'relative' }}>
                      {category?.name ?? 'All Icons'}<span style={{ color: 'var(--accent)' }}>.</span>
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, fontSize: 13, color: 'var(--muted)' }}>
                      <span><strong style={{ color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{categoryIcons.length}</strong> icons</span>
                      <span style={{ color: 'var(--border)' }}>|</span>
                      <span>by{' '}
                        {family.authors.map((a, i) => (
                          <span key={i}>{i > 0 ? ', ' : ' '}
                            {a.url ? <a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'var(--foreground)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 3 }}>{a.name}</a> : <strong style={{ color: 'var(--foreground)' }}>{a.name}</strong>}
                          </span>
                        ))}
                      </span>
                      <span style={{ color: 'var(--border)' }}>|</span>
                      <span>{licenseId.toUpperCase()}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', paddingBottom: 6, fontSize: 12, color: 'var(--muted-2)' }}>SVG · PNG</div>
                </div>

                {/* Subcategory sections + grid */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 34px 90px' }}>
                  {browseSections.map((sec, si) => (
                    <div key={si} style={{ marginTop: 22 }}>
                      {sec.name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted)' }}>{sec.name}</span>
                          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted-2)' }}>{sec.icons.length}</span>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 6 }}>
                        {sec.icons.map((ic, ii) => {
                          const vlist = resolveVariants(ic);
                          const variant = vlist.find(v => v.bundleId === currentBundle) ?? vlist[0];
                          if (!variant) return null;
                          const active = ic.id === selectedId;
                          const locked = isLocked(ic);
                          const checked = selected.has(ic.id);
                          return (
                            <button
                              key={ic.id}
                              onClick={() => selectMode ? (!locked && toggleSel(ic.id)) : handleSelect(ic.id)}
                              title={locked ? `${ic.name} · Pro` : ic.name}
                              style={{ position: 'relative', display: 'flex', flexDirection: 'column', aspectRatio: '1 / 1.12', borderRadius: 'var(--radius)', cursor: locked && selectMode ? 'not-allowed' : 'pointer', border: `1px solid ${checked ? 'var(--foreground)' : active ? 'var(--border-2)' : 'transparent'}`, background: checked || active ? 'var(--cell-hover)' : 'var(--surface)', color: 'var(--foreground)', transition: 'background .12s' }}
                              className="hover:bg-[var(--cell-hover)]"
                            >
                              <span style={{ position: 'absolute', top: 9, left: 11, fontSize: 11, color: 'var(--muted-2)', opacity: .7 }}>{String(ii + 1).padStart(2, '0')}</span>
                              {selectMode && !locked && (
                                <span style={{ position: 'absolute', top: 8, right: 9, width: 18, height: 18, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: checked ? 'var(--accent)' : 'rgba(255,255,255,.85)', border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-2)'}` }}>
                                  {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                </span>
                              )}
                              {locked && (
                                <span title="Pro" style={{ position: 'absolute', top: 8, right: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, background: 'var(--pro, #7C6AE8)', color: '#fff', fontSize: 8 }}>
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                                </span>
                              )}
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: locked ? .32 : 1 }}>
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
                              <span style={{ alignSelf: 'center', padding: '0 8px 14px', fontSize: 11.5, color: 'var(--muted)', maxWidth: '86%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              userTier={session?.tier ?? 'free'}
              unlockedVariants={proVectors[selectedIcon.id] ?? null}
              onRequestLogin={() => setSigninOpen(true)}
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
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: 320 }}>
            <button onClick={() => setDonateOpen(false)} aria-label="Close" style={{ position: 'absolute', top: -14, right: -14, height: 30, width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--muted)', cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div style={{ padding: 22, background: 'var(--background)', border: '0.5px solid #C7C7C7', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Support this project</div>
              <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>If these icons help you, consider a small donation.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([
                  { label: 'Buy Me a Coffee', href: DONATE.buyMeACoffee, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg> },
                  { label: 'Ko-fi', href: DONATE.kofi, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> },
                  { label: 'PayPal', href: DONATE.paypal, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
                ] as const).filter(o => o.href && !o.href.includes('YOUR_HANDLE')).map(o => (
                  <a key={o.label} href={o.href} target="_blank" rel="noreferrer" style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderRadius: 'var(--radius)', background: 'var(--surface-2)', border: '0.5px solid #C7C7C7', color: 'var(--foreground)', fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'transform .1s ease' }} className="hover:bg-[var(--field)]" onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
                    {o.icon}{o.label}
                  </a>
                ))}
                {[DONATE.buyMeACoffee, DONATE.kofi, DONATE.paypal].every(h => !h || h.includes('YOUR_HANDLE')) && (
                  <div style={{ fontSize: 12, color: 'var(--muted-2)', textAlign: 'center', padding: '8px 0' }}>No donation links configured yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sign-in modal */}
      {signinOpen && (
        <div onClick={() => setSigninOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)' }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: 380, maxWidth: '100%' }}>
            <button onClick={() => setSigninOpen(false)} aria-label="Close" style={{ position: 'absolute', top: -14, right: -14, height: 30, width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--muted)', cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div style={{ padding: '40px 40px 36px', textAlign: 'center', background: 'var(--background)', border: '0.5px solid #C7C7C7', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
              <div style={{ width: 52, height: 52, margin: '0 auto', borderRadius: 'var(--radius)', background: 'var(--foreground)', color: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, letterSpacing: '-.5px' }}>R</div>
              <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-.5px', marginTop: 18 }}>Welcome back</div>
              <p style={{ margin: '8px auto 26px', maxWidth: 300, fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>Sign in to save collections, sync favourites and download in bulk.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
                <button onClick={() => { setSigninOpen(false); login(); }} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#181717', color: '#fff', border: 'none', padding: '14px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', borderRadius: 'var(--radius)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.4 9.4 0 0 1 2.5-.34c.85 0 1.71.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2z"/></svg>
                  Continue with GitHub
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 'auto', opacity: .5 }}><polyline points="9 6 15 12 9 18"/></svg>
                </button>
              </div>
              <div style={{ marginTop: 22, fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }}>By continuing you agree to the <span style={{ color: 'var(--muted)' }}>Terms</span> &amp; <span style={{ color: 'var(--muted)' }}>Privacy Policy</span>.</div>
            </div>
          </div>
        </div>
      )}

      {/* Pricing modal */}
      {pricingOpen && (
        <div onClick={() => setPricingOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)', padding: 40 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: 620, maxWidth: '100%' }}>
            <button onClick={() => setPricingOpen(false)} aria-label="Close" style={{ position: 'absolute', top: -14, right: -14, height: 30, width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--muted)', cursor: 'pointer', zIndex: 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div style={{ padding: '40px 40px 38px', background: 'var(--background)', border: '0.5px solid #C7C7C7', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 24, letterSpacing: '-.6px' }}>Simple, honest pricing</div>
                <p style={{ margin: '8px auto 0', maxWidth: 380, fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>Every icon is free forever. Upgrade for the full library, unlimited downloads and every export format.</p>
              </div>
              <div style={{ marginTop: 26 }}>
                <PricingCards />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className="toast-in" style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 95, display: 'flex', alignItems: 'center', gap: 6, background: '#141414', color: '#fff', padding: '8px 8px 8px 20px', borderRadius: 'var(--radius)', boxShadow: '0 20px 50px -18px rgba(0,0,0,.5)' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{selected.size} selected</span>
          <span style={{ width: 1, height: 20, background: '#3a3a3a', margin: '0 8px' }} />
          <button onClick={clearSel} style={{ height: 34, padding: '0 12px', background: 'transparent', border: 'none', color: '#9a9a9a', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius)' }}>Clear</button>
          <button onClick={downloadZip} style={{ height: 34, padding: '0 15px', display: 'flex', alignItems: 'center', gap: 7, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 13, cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download ZIP
          </button>
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
