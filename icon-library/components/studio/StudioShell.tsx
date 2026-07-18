'use client';
import { useState, useCallback, useEffect } from 'react';
import type { FamilyMeta, BundleDef, CategoryNode, Credit, IconOverride } from '@/types';
import type { FamilySummary, SourceTree, TreeIcon, TreeBundle, TreeCategory } from '@/lib/studio';
import { PREDEFINED_BUNDLES, DEFAULT_LICENSES } from '@/taxonomy.config';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

interface Props {
  families: FamilySummary[];
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ── small styled primitives ─────────────────────────────────────────────────
const LABEL: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 6, display: 'block' };
const INPUT: React.CSSProperties = { width: '100%', height: 34, padding: '0 10px', background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--foreground)', fontSize: 13, outline: 'none' };
const BTN: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 'var(--radius)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--foreground)' };
const BTN_PRIMARY: React.CSSProperties = { ...BTN, background: 'var(--foreground)', color: 'var(--background)', border: 'none' };
const ICON_BTN: React.CSSProperties = { width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--muted)', cursor: 'pointer', padding: 0 };

const isSafeSvg = (t: string) => /<svg[\s>]/i.test(t) && !/<script|on\w+\s*=/i.test(t);

// Cheap paint-model sniff to catch source that won't survive the render model:
// a stroke bundle forces fill:none (solid fills vanish); a fill bundle renders
// paths as-is (open strokes need outlining first). Returns a warning or null.
const paintMismatch = (svg: string, strokeBased: boolean): string | null => {
  const hasOpenStroke = /stroke="(?!none")[^"]+"/i.test(svg) || /stroke-width=/i.test(svg);
  const hasSolidFill = /fill="(?!none")(?!currentColor")[^"]+"/i.test(svg);
  if (strokeBased && hasSolidFill) return 'has solid fill — will vanish in an outline bundle (redraw as stroke)';
  if (!strokeBased && hasOpenStroke && !hasSolidFill) return 'looks stroke-only — outline it in Figma before a fill bundle';
  return null;
};
const catIconCount = (c: TreeCategory) => c.icons.length + c.subs.reduce((m, s) => m + s.icons.length, 0);
const bundleIconCount = (b: TreeBundle) => b.categories.reduce((n, c) => n + catIconCount(c), 0);

type ViewMode = 'meta' | 'bundle' | 'category';
interface View { mode: ViewMode; bundleId?: string; categoryId?: string }
// A taxonomy node targeted for rename/delete. `categoryId` is the parent when
// type === 'subcategory'.
interface TaxTarget { type: 'bundle' | 'category' | 'subcategory'; id: string; categoryId?: string; current: string }

export function StudioShell({ families }: Props) {
  const [list, setList] = useState<FamilySummary[]>(families);
  const [slug, setSlug] = useState<string | null>(null);
  const [family, setFamily] = useState<FamilyMeta | null>(null);
  const [tree, setTree] = useState<SourceTree | null>(null);
  const [view, setView] = useState<View>({ mode: 'meta' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');
  const [famMenu, setFamMenu] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [bundleModal, setBundleModal] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [renaming, setRenaming] = useState<TaxTarget | null>(null);
  const [confirmDel, setConfirmDel] = useState<TaxTarget | null>(null);
  const [editBundle, setEditBundle] = useState<BundleDef | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }, []);

  const loadTree = useCallback(async (s: string) => {
    try {
      const res = await fetch(`/api/studio/family/${s}/tree`);
      const data = await res.json();
      if (res.ok) setTree(data.tree);
    } catch { /* ignore */ }
  }, []);

  const loadFamily = useCallback(async (s: string) => {
    setLoading(true);
    setSlug(s);
    setFamMenu(false);
    try {
      const fRes = await fetch(`/api/studio/family/${s}`);
      const fData = await fRes.json();
      if (fRes.ok) {
        const fam: FamilyMeta = fData.family;
        setFamily(fam); setDirty(false);
        setView(fam.bundles[0] ? { mode: 'bundle', bundleId: fam.bundles[0].id } : { mode: 'meta' });
        await loadTree(s);
      } else flash(fData.error ?? 'Load failed');
    } catch { flash('Load failed'); }
    setLoading(false);
  }, [flash, loadTree]);

  const update = useCallback((patch: Partial<FamilyMeta>) => {
    setFamily(prev => prev ? { ...prev, ...patch } : prev);
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!family || !slug) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/studio/family/${slug}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ family }),
      });
      const data = await res.json();
      if (res.ok) { setDirty(false); flash('Saved to family.json'); }
      else flash(data.error ?? 'Save failed');
    } catch { flash('Save failed'); }
    setSaving(false);
  }, [family, slug, flash]);

  // Persist a computed next family immediately (used by create-bundle/category/
  // subcategory so the tree + counts reflect right away without stale closures).
  const saveFamily = useCallback(async (next: FamilyMeta): Promise<boolean> => {
    if (!slug) return false;
    setFamily(next);
    try {
      const res = await fetch(`/api/studio/family/${slug}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ family: next }),
      });
      if (res.ok) { setDirty(false); await loadTree(slug); return true; }
      const d = await res.json(); flash(d.error ?? 'Save failed'); return false;
    } catch { flash('Save failed'); return false; }
  }, [slug, loadTree, flash]);

  const [building, setBuilding] = useState(false);
  const rebuild = useCallback(async () => {
    setBuilding(true);
    try {
      const res = await fetch('/api/studio/build', { method: 'POST' });
      const data = await res.json();
      flash(res.ok ? 'Rebuilt public index' : (data.error ?? 'Build failed'));
    } catch { flash('Build failed'); }
    setBuilding(false);
  }, [flash]);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch('/api/studio/families');
      const data = await res.json();
      if (res.ok) setList(data.families);
    } catch { /* ignore */ }
  }, []);

  const deleteFamily = useCallback(async () => {
    if (!slug) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/studio/family/${slug}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setDelOpen(false); setDelText('');
        setSlug(null); setFamily(null); setTree(null);
        await refreshList();
        flash('Family deleted — Rebuild to update the catalog');
      } else flash(data.error ?? 'Delete failed');
    } catch { flash('Delete failed'); }
    setDeleting(false);
  }, [slug, refreshList, flash]);

  const newSlug = slugify(newName);
  const createFamily = useCallback(async () => {
    const s = slugify(newName);
    if (!s) { flash('Name required'); return; }
    if (list.some(f => f.slug === s)) { flash(`"${s}" already exists`); return; }
    setCreating(true);
    const meta: FamilyMeta = {
      id: s, name: newName.trim(), slug: s,
      authors: [{ name: '' }], license: 'mit', defaultTier: 'free', status: 'draft',
      bundles: PREDEFINED_BUNDLES.filter(b => b.id === 'outline')
        .map(b => ({ id: b.id, name: 'Regular', strokeBased: b.strokeBased, predefined: true, strokeWidth: 1.5 })),
      categories: [],
    };
    try {
      const res = await fetch(`/api/studio/family/${s}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ family: meta }),
      });
      const data = await res.json();
      if (res.ok) { setNewOpen(false); setNewName(''); await refreshList(); await loadFamily(s); flash('Family created (draft)'); }
      else flash(data.error ?? 'Create failed');
    } catch { flash('Create failed'); }
    setCreating(false);
  }, [newName, list, refreshList, loadFamily, flash]);

  const exportJson = useCallback(() => {
    if (!family) return;
    const blob = new Blob([JSON.stringify(family, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'family.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, [family]);

  // create-bundle / add-category (add-subcategory lives in CategoryPage).
  const createBundle = useCallback(async (def: BundleDef) => {
    if (!family) return;
    if (family.bundles.some(b => b.id === def.id)) { flash(`Bundle "${def.id}" exists`); return; }
    const ok = await saveFamily({ ...family, bundles: [...family.bundles, def] });
    if (ok) { setBundleModal(false); setView({ mode: 'bundle', bundleId: def.id }); flash(`Bundle "${def.name}" created`); }
  }, [family, saveFamily, flash]);

  const addCategory = useCallback(async (cat: CategoryNode) => {
    if (!family) return;
    if (family.categories.some(c => c.id === cat.id)) { flash(`Category "${cat.id}" exists`); return; }
    const ok = await saveFamily({ ...family, categories: [...family.categories, cat] });
    if (ok) { setCatModal(false); flash(`Category "${cat.name}" added`); }
  }, [family, saveFamily, flash]);

  // Edit a bundle's name + paint type (outline/fill) + stroke width.
  const saveBundleEdit = useCallback(async (patch: { name: string; strokeBased: boolean; strokeWidth?: number }) => {
    if (!family || !editBundle) return;
    const next: FamilyMeta = {
      ...family,
      bundles: family.bundles.map(b => b.id === editBundle.id
        ? { ...b, name: patch.name, strokeBased: patch.strokeBased, strokeWidth: patch.strokeBased ? patch.strokeWidth : undefined }
        : b),
    };
    const ok = await saveFamily(next);
    if (ok) { setEditBundle(null); flash(`Bundle "${patch.name}" updated — Rebuild to update`); }
  }, [family, editBundle, saveFamily, flash]);

  // Rename = display-name only (family.json `name`); id/folder unchanged.
  const renameTaxonomy = useCallback(async (t: TaxTarget, newName: string) => {
    if (!family || !newName.trim()) return;
    const nm = newName.trim();
    let next: FamilyMeta;
    if (t.type === 'bundle') next = { ...family, bundles: family.bundles.map(b => b.id === t.id ? { ...b, name: nm } : b) };
    else if (t.type === 'category') next = { ...family, categories: family.categories.map(c => c.id === t.id ? { ...c, name: nm } : c) };
    else next = { ...family, categories: family.categories.map(c => c.id === t.categoryId ? { ...c, subcategories: c.subcategories.map(s => s.id === t.id ? { ...s, name: nm } : s) } : c) };
    const ok = await saveFamily(next);
    if (ok) { setRenaming(null); flash('Renamed'); }
  }, [family, saveFamily, flash]);

  // Delete taxonomy node (blocked server-side if it still holds icons).
  const doDeleteTaxonomy = useCallback(async (t: TaxTarget) => {
    if (!slug) return;
    const params = new URLSearchParams({ type: t.type, id: t.id });
    if (t.categoryId) params.set('categoryId', t.categoryId);
    try {
      const res = await fetch(`/api/studio/family/${slug}/taxonomy?${params}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { flash(data.error ?? 'Delete failed'); return; }
      // Re-fetch the now-mutated family.json + tree, and step the view out of a
      // node that no longer exists.
      const r = await fetch(`/api/studio/family/${slug}`);
      const d = await r.json();
      if (r.ok) {
        const fam: FamilyMeta = d.family;
        setFamily(fam); setDirty(false);
        if (t.type === 'bundle' && view.bundleId === t.id) {
          setView(fam.bundles[0] ? { mode: 'bundle', bundleId: fam.bundles[0].id } : { mode: 'meta' });
        } else if (t.type === 'category' && view.categoryId === t.id) {
          setView({ mode: 'bundle', bundleId: view.bundleId });
        }
      }
      await loadTree(slug);
      setConfirmDel(null);
      flash('Deleted — Rebuild to update');
    } catch { flash('Delete failed'); }
  }, [slug, view, loadTree, flash]);

  const bundleNode = tree?.bundles.find(b => b.id === view.bundleId) ?? null;
  const catCountIn = (catId: string) => {
    const c = bundleNode?.categories.find(x => x.id === catId);
    return c ? catIconCount(c) : 0;
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--background)', color: 'var(--foreground)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ flex: '0 0 260px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Studio</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle />
            <a href="/" style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'none' }}>← Browse</a>
          </div>
        </div>

        {/* Family dropdown */}
        <div style={{ position: 'relative', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setFamMenu(o => !o)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--foreground)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{family ? family.name : 'Select family'}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ opacity: .5 }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {family && (
              <button onClick={() => setView({ mode: 'meta' })} title="Family settings" style={{ flexShrink: 0, height: 34, width: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: view.mode === 'meta' ? 'var(--surface-2)' : 'transparent', color: view.mode === 'meta' ? 'var(--foreground)' : 'var(--muted)', cursor: 'pointer' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
            )}
          </div>
          {famMenu && (
            <>
              <div onClick={() => setFamMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
              <div style={{ position: 'absolute', top: '100%', left: 12, right: 12, zIndex: 51, marginTop: 4, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 14px 34px -14px rgba(0,0,0,.3)', padding: 5 }}>
                {list.map(f => (
                  <button key={f.slug} onClick={() => loadFamily(f.slug)} style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 1, padding: '7px 10px', borderRadius: 'var(--radius)', border: 'none', background: slug === f.slug ? 'var(--surface-2)' : 'transparent', color: 'var(--foreground)', cursor: 'pointer' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted-2)', fontFamily: 'var(--font-mono)' }}>{f.slug} · {f.iconCount} svg · {f.status}</span>
                  </button>
                ))}
                <button onClick={() => { setFamMenu(false); setNewName(''); setNewOpen(true); }} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', marginTop: 4, borderTop: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>+ New family</button>
              </div>
            </>
          )}
        </div>

        {/* Bundle → category tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {!family ? (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--muted-2)' }}>No family selected</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', marginBottom: 2 }}>
                <span style={LABEL}>Bundles</span>
                <button onClick={() => setBundleModal(true)} title="Create bundle" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>+ Bundle</button>
              </div>
              {family.bundles.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--muted-2)' }}>No bundles. Create one.</div>}
              {family.bundles.map(b => {
                const bNode = tree?.bundles.find(x => x.id === b.id);
                const active = view.bundleId === b.id;
                const total = bNode ? bundleIconCount(bNode) : 0;
                return (
                  <div key={b.id}>
                    <button
                      onClick={() => setView({ mode: 'bundle', bundleId: b.id })}
                      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', background: active && view.mode === 'bundle' ? 'var(--accent-soft)' : 'transparent', color: 'var(--foreground)', marginBottom: 2, boxShadow: active ? 'inset 0 0 0 1px var(--accent)' : undefined }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--muted)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--foreground)' }}>{b.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted-2)', fontFamily: 'var(--font-mono)' }}>{total}</span>
                    </button>
                    {active && (
                      <div style={{ marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid var(--border)', marginBottom: 4 }}>
                        {family.categories.length === 0 && <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--muted-2)' }}>No categories</div>}
                        {family.categories.map(c => {
                          const cn = bNode?.categories.find(x => x.id === c.id);
                          const count = cn ? catIconCount(cn) : 0;
                          const catActive = view.mode === 'category' && view.categoryId === c.id;
                          return (
                            <button key={c.id} onClick={() => setView({ mode: 'category', bundleId: b.id, categoryId: c.id })}
                              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', background: catActive ? 'var(--surface-2)' : 'transparent', color: catActive ? 'var(--foreground)' : 'var(--muted)', fontSize: 12.5, fontWeight: catActive ? 600 : 400 }}>
                              <span style={{ color: 'var(--muted-2)' }}>└</span>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                              <span style={{ fontSize: 10, color: 'var(--muted-2)', fontFamily: 'var(--font-mono)' }}>{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!family ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-2)', fontSize: 14 }}>
            {loading ? 'Loading…' : 'Select a family to edit'}
          </div>
        ) : (
          <>
            <header style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
                {view.mode === 'meta' ? 'Family settings'
                  : view.mode === 'bundle' ? (family.bundles.find(b => b.id === view.bundleId)?.name ?? 'Bundle')
                  : `${family.bundles.find(b => b.id === view.bundleId)?.name ?? ''} / ${family.categories.find(c => c.id === view.categoryId)?.name ?? ''}`}
              </span>
              <div style={{ flex: 1 }} />
              {dirty && <span style={{ fontSize: 11, color: 'var(--muted-2)', fontFamily: 'var(--font-mono)' }}>unsaved</span>}
              <button onClick={rebuild} disabled={building} style={{ ...BTN, opacity: building ? .5 : 1 }}>{building ? 'Building…' : 'Rebuild'}</button>
              <button onClick={exportJson} style={BTN}>Export JSON</button>
              <button onClick={save} disabled={saving || !dirty} style={{ ...BTN_PRIMARY, opacity: saving || !dirty ? .5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
              <div style={{ maxWidth: view.mode === 'meta' ? 640 : 1040 }}>
                {view.mode === 'meta' && <MetaTab family={family} update={update} onRequestDelete={() => { setDelText(''); setDelOpen(true); }} />}
                {view.mode === 'bundle' && view.bundleId && (
                  <BundleOverview
                    family={family}
                    bundle={family.bundles.find(b => b.id === view.bundleId)!}
                    categoryCount={catCountIn}
                    onOpenCategory={cid => setView({ mode: 'category', bundleId: view.bundleId, categoryId: cid })}
                    onAddCategory={() => setCatModal(true)}
                    onEdit={setEditBundle}
                    onRename={setRenaming}
                    onDelete={setConfirmDel}
                  />
                )}
                {view.mode === 'category' && view.bundleId && view.categoryId && (
                  <CategoryPage
                    key={`${view.bundleId}/${view.categoryId}`}
                    family={family} slug={slug!} tree={tree}
                    bundleId={view.bundleId} categoryId={view.categoryId}
                    update={update} flash={flash} reloadTree={() => loadTree(slug!)} saveFamily={saveFamily}
                    onRenameSub={setRenaming} onDeleteSub={setConfirmDel}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* New family */}
      {newOpen && (
        <div onClick={() => !creating && setNewOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 380, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 10 }}>New family</div>
            <label style={LABEL}>Name</label>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newSlug) createFamily(); }} placeholder="My Icons" style={{ ...INPUT, marginBottom: 8 }} />
            <div style={{ fontSize: 11.5, color: 'var(--muted-2)', marginBottom: 14 }}>
              Slug: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{newSlug || '—'}</code> · starts as <strong style={{ color: 'var(--muted)' }}>draft</strong> with a Regular bundle. Set Status = published in settings to go live.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setNewOpen(false)} disabled={creating} style={BTN}>Cancel</button>
              <button onClick={createFamily} disabled={creating || !newSlug} style={{ ...BTN_PRIMARY, opacity: creating || !newSlug ? .5 : 1 }}>{creating ? 'Creating…' : 'Create family'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create bundle */}
      {bundleModal && family && (
        <CreateBundleModal existing={family.bundles.map(b => b.id)} onCancel={() => setBundleModal(false)} onCreate={createBundle} />
      )}

      {/* Add category */}
      {catModal && family && (
        <AddCategoryModal existing={family.categories.map(c => c.id)} onCancel={() => setCatModal(false)} onCreate={addCategory} />
      )}

      {/* Rename taxonomy node (display name) */}
      {renaming && (
        <RenameModal target={renaming} onCancel={() => setRenaming(null)} onSave={nm => renameTaxonomy(renaming, nm)} />
      )}

      {/* Delete taxonomy node (blocked if not empty) */}
      {confirmDel && (
        <TaxDeleteModal target={confirmDel} onCancel={() => setConfirmDel(null)} onConfirm={() => doDeleteTaxonomy(confirmDel)} />
      )}

      {/* Edit bundle (name + outline/fill type + stroke width) */}
      {editBundle && (
        <EditBundleModal bundle={editBundle} onCancel={() => setEditBundle(null)} onSave={saveBundleEdit} />
      )}

      {/* Delete-family confirm */}
      {delOpen && family && (
        <div onClick={() => !deleting && setDelOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 400, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Delete family</div>
            <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              This permanently removes <strong style={{ color: 'var(--foreground)' }}>{family.name}</strong> and all its icons from <code style={{ fontFamily: 'var(--font-mono)' }}>icons-source/{family.slug}/</code>. This cannot be undone.
            </p>
            <label style={LABEL}>Type <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--foreground)' }}>{family.slug}</code> to confirm</label>
            <input autoFocus value={delText} onChange={e => setDelText(e.target.value)} placeholder={family.slug} style={{ ...INPUT, fontFamily: 'var(--font-mono)', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDelOpen(false)} disabled={deleting} style={BTN}>Cancel</button>
              <button onClick={deleteFamily} disabled={deleting || delText !== family.slug} style={{ ...BTN, background: '#c0392b', color: '#fff', border: 'none', opacity: deleting || delText !== family.slug ? .5 : 1 }}>{deleting ? 'Deleting…' : 'Delete family'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-in" style={{ position: 'fixed', bottom: 24, left: '50%', zIndex: 99, height: 40, display: 'flex', alignItems: 'center', padding: '0 16px', background: 'var(--foreground)', color: 'var(--background)', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Meta view ────────────────────────────────────────────────────────────────
function MetaTab({ family, update, onRequestDelete }: { family: FamilyMeta; update: (p: Partial<FamilyMeta>) => void; onRequestDelete: () => void }) {
  const setAuthor = (i: number, patch: Partial<Credit>) => {
    const authors = family.authors.map((a, idx) => idx === i ? { ...a, ...patch } : a);
    update({ authors });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Row><label style={LABEL}>Name</label><input style={INPUT} value={family.name} onChange={e => update({ name: e.target.value })} /></Row>
      <Row><label style={LABEL}>Slug (folder name — matches icons-source/)</label><input style={{ ...INPUT, fontFamily: 'var(--font-mono)' }} value={family.slug} onChange={e => update({ slug: slugify(e.target.value) })} /></Row>
      <Row><label style={LABEL}>Description</label><textarea style={{ ...INPUT, height: 64, padding: 10, resize: 'vertical' }} value={family.description ?? ''} onChange={e => update({ description: e.target.value })} /></Row>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Row><label style={LABEL}>License</label>
          <select style={INPUT} value={family.license} onChange={e => update({ license: e.target.value })}>
            {DEFAULT_LICENSES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            {!DEFAULT_LICENSES.some(l => l.id === family.license) && <option value={family.license}>{family.license}</option>}
          </select>
        </Row>
        <Row><label style={LABEL}>Default tier</label>
          <select style={INPUT} value={family.defaultTier} onChange={e => update({ defaultTier: e.target.value as 'free' | 'pro' })}>
            <option value="free">Free</option><option value="pro">Pro</option>
          </select>
        </Row>
        <Row><label style={LABEL}>Version</label><input style={{ ...INPUT, fontFamily: 'var(--font-mono)' }} value={family.version ?? ''} onChange={e => update({ version: e.target.value })} /></Row>
        <Row><label style={LABEL}>Base grid</label><input type="number" style={{ ...INPUT, fontFamily: 'var(--font-mono)' }} value={family.baseGrid ?? 24} onChange={e => update({ baseGrid: +e.target.value })} /></Row>
      </div>

      <Row><label style={LABEL}>Status</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['draft', 'published'] as const).map(s => (
            <button key={s} onClick={() => update({ status: s })} style={{ ...BTN, flex: 1, textTransform: 'capitalize', background: family.status === s ? 'var(--foreground)' : 'transparent', color: family.status === s ? 'var(--background)' : 'var(--muted)', border: family.status === s ? 'none' : '1px solid var(--border)' }}>{s}</button>
          ))}
        </div>
      </Row>

      <div>
        <label style={LABEL}>Authors</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {family.authors.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...INPUT, flex: 1 }} placeholder="Name" value={a.name} onChange={e => setAuthor(i, { name: e.target.value })} />
              <input style={{ ...INPUT, flex: 1.4 }} placeholder="URL (optional)" value={a.url ?? ''} onChange={e => setAuthor(i, { url: e.target.value || undefined })} />
              <button onClick={() => update({ authors: family.authors.filter((_, idx) => idx !== i) })} style={{ ...BTN, width: 34, padding: 0 }}>✕</button>
            </div>
          ))}
          <button onClick={() => update({ authors: [...family.authors, { name: '' }] })} style={{ ...BTN, alignSelf: 'flex-start' }}>+ Add author</button>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: 16, border: '1px solid #5a2a26', borderRadius: 'var(--radius)', background: 'rgba(192,57,43,.06)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#e5645a', marginBottom: 4 }}>Danger zone</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Permanently delete this family and all its icons.</span>
          <button onClick={onRequestDelete} style={{ ...BTN, flexShrink: 0, background: 'transparent', color: '#e5645a', border: '1px solid #5a2a26' }}>Delete family</button>
        </div>
      </div>
    </div>
  );
}

// ── Bundle overview: category cards for the selected bundle ───────────────────
function BundleOverview({ family, bundle, categoryCount, onOpenCategory, onAddCategory, onEdit, onRename, onDelete }: {
  family: FamilyMeta;
  bundle: BundleDef;
  categoryCount: (catId: string) => number;
  onOpenCategory: (catId: string) => void;
  onAddCategory: () => void;
  onEdit: (b: BundleDef) => void;
  onRename: (t: TaxTarget) => void;
  onDelete: (t: TaxTarget) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{bundle.name}</span>
        <span style={{ fontSize: 11, color: 'var(--muted-2)', fontFamily: 'var(--font-mono)' }}>{bundle.id} · {bundle.strokeBased ? `outline${bundle.strokeWidth ? ` ${bundle.strokeWidth}px` : ''}` : 'fill'}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => onEdit(bundle)} style={{ ...BTN, height: 30, fontSize: 12 }}>Edit</button>
        <button onClick={() => onDelete({ type: 'bundle', id: bundle.id, current: bundle.name })} style={{ ...BTN, height: 30, fontSize: 12, color: '#e5645a', border: '1px solid #5a2a26' }}>Delete bundle</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={LABEL}>Categories</span>
        <button onClick={onAddCategory} style={BTN}>+ Add category</button>
      </div>
      {family.categories.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted-2)' }}>No categories yet. Add one, then open it to upload icons.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {family.categories.map(c => (
            <div key={c.id} onClick={() => onOpenCategory(c.id)} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', cursor: 'pointer' }}>
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                <button title="Rename category" onClick={e => { e.stopPropagation(); onRename({ type: 'category', id: c.id, current: c.name }); }} style={ICON_BTN}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button title="Delete category" onClick={e => { e.stopPropagation(); onDelete({ type: 'category', id: c.id, current: c.name }); }} style={ICON_BTN}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontSize: 11, color: 'var(--muted-2)', fontFamily: 'var(--font-mono)' }}>{categoryCount(c.id)} icons{c.subcategories.length ? ` · ${c.subcategories.length} sub` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Category page: upload + subcategory sections + per-icon governance ────────
function CategoryPage({ family, slug, tree, bundleId, categoryId, update, flash, reloadTree, saveFamily, onRenameSub, onDeleteSub }: {
  family: FamilyMeta; slug: string; tree: SourceTree | null;
  bundleId: string; categoryId: string;
  update: (p: Partial<FamilyMeta>) => void; flash: (m: string) => void;
  reloadTree: () => Promise<void>; saveFamily: (f: FamilyMeta) => Promise<boolean>;
  onRenameSub: (t: TaxTarget) => void; onDeleteSub: (t: TaxTarget) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<{ icon: TreeIcon; sub?: string } | null>(null);
  const [bulkMoving, setBulkMoving] = useState(false);
  const [subModal, setSubModal] = useState(false);
  // Bulk selection: keys are `${sub ?? ''}/${name}` (a name can repeat across
  // subcategory sections, so the section scopes it).
  const [sel, setSel] = useState<Set<string>>(new Set());
  const selKey = (name: string, sub?: string) => `${sub ?? ''}/${name}`;
  const toggleSel = (name: string, sub?: string) => {
    const k = selKey(name, sub);
    setSel(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };
  const overrides = family.overrides ?? {};
  const cat = family.categories.find(c => c.id === categoryId);
  const bundle = family.bundles.find(b => b.id === bundleId);
  const catNode = tree?.bundles.find(b => b.id === bundleId)?.categories.find(c => c.id === categoryId) ?? null;

  const setOverride = (name: string, patch: Partial<IconOverride>) => {
    const next: Record<string, IconOverride> = { ...overrides };
    const merged: IconOverride = { ...next[name], ...patch };
    if (merged.tags && merged.tags.length === 0) delete merged.tags;
    if (merged.name === '') delete merged.name;
    if (Object.keys(merged).length === 0) delete next[name];
    else next[name] = merged;
    update({ overrides: next });
  };

  const uploadHere = async (files: FileList | null) => {
    if (!files) return;
    const items: { bundleId: string; categoryId: string; name: string; svg: string }[] = [];
    const warnings: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.svg')) continue;
      const svg = await file.text();
      const name = slugify(file.name.replace(/\.svg$/i, ''));
      if (!name) continue;
      if (!isSafeSvg(svg)) { flash(`${name}: invalid/unsafe SVG`); continue; }
      const warn = paintMismatch(svg, bundle?.strokeBased ?? true);
      if (warn) warnings.push(`${name}: ${warn}`);
      items.push({ bundleId, categoryId, name, svg });
    }
    if (items.length === 0) { flash('No valid .svg files'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/studio/family/${slug}/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, autoCreateTaxonomy: false }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        flash(warnings.length ? `Uploaded ${data.written.length}, ${warnings.length} warning — ${warnings[0]}` : `Uploaded ${data.written.length} — Rebuild to update`);
        await reloadTree();
      } else flash(data.errors?.[0] ?? data.error ?? 'Upload failed');
    } catch { flash('Upload failed'); }
    setBusy(false);
  };

  // Raw API callers (no toast/reload) — shared by single-icon and bulk actions.
  const rawMove = async (from: { bundleId: string; categoryId: string; subcategoryId?: string; name: string }, to: { bundleId: string; categoryId: string; subcategoryId?: string }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/studio/family/${slug}/file`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }),
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: (await res.json()).error };
    } catch { return { ok: false, error: 'Move failed' }; }
  };
  const rawDelete = async (name: string, sub: string | undefined): Promise<boolean> => {
    const params = new URLSearchParams({ bundleId, categoryId, name });
    if (sub) params.set('subcategoryId', sub);
    try { return (await fetch(`/api/studio/family/${slug}/file?${params}`, { method: 'DELETE' })).ok; }
    catch { return false; }
  };

  const moveFile = async (from: { bundleId: string; categoryId: string; subcategoryId?: string; name: string }, to: { bundleId: string; categoryId: string; subcategoryId?: string }) => {
    setBusy(true);
    const r = await rawMove(from, to);
    if (r.ok) { flash(`Moved ${from.name} — Rebuild to update`); setMoving(null); await reloadTree(); }
    else flash(r.error ?? 'Move failed');
    setBusy(false);
  };

  const assignSub = (icon: TreeIcon, currentSub: string | undefined, nextSub: string) => {
    const to = { bundleId, categoryId, subcategoryId: nextSub || undefined };
    if ((currentSub ?? '') === (nextSub || '')) return;
    moveFile({ bundleId, categoryId, subcategoryId: currentSub, name: icon.name }, to);
  };

  const deleteFile = async (name: string, sub: string | undefined) => {
    setBusy(true);
    if (await rawDelete(name, sub)) { flash(`Deleted ${name} — Rebuild to update`); await reloadTree(); }
    else flash('Delete failed');
    setBusy(false);
  };

  const addSubcategory = async (sub: { id: string; name: string }) => {
    if (!cat) return;
    if (cat.subcategories.some(s => s.id === sub.id)) { flash(`Subcategory "${sub.id}" exists`); return; }
    const next: FamilyMeta = { ...family, categories: family.categories.map(c => c.id === categoryId ? { ...c, subcategories: [...c.subcategories, sub] } : c) };
    const ok = await saveFamily(next);
    if (ok) { setSubModal(false); flash(`Subcategory "${sub.name}" added`); }
  };

  // Build sections: "No subcategory" (loose) + one per family subcategory.
  const sections: { key: string; label: string; sub?: string; icons: TreeIcon[] }[] = [
    { key: '', label: 'No subcategory', sub: undefined, icons: catNode?.icons ?? [] },
    ...(cat?.subcategories ?? []).map(s => ({ key: s.id, label: s.name, sub: s.id, icons: catNode?.subs.find(x => x.id === s.id)?.icons ?? [] })),
  ];
  const subOptions = cat?.subcategories ?? [];

  // Resolve the current selection against the live tree (drops stale entries).
  const selected: { name: string; sub?: string }[] = [];
  for (const sec of sections) for (const ic of sec.icons) if (sel.has(selKey(ic.name, sec.sub))) selected.push({ name: ic.name, sub: sec.sub });

  const allVisible: { name: string; sub?: string }[] = [];
  for (const sec of sections) for (const ic of sec.icons) allVisible.push({ name: ic.name, sub: sec.sub });
  const allSelected = allVisible.length > 0 && selected.length === allVisible.length;
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(allVisible.map(x => selKey(x.name, x.sub))));

  const bulkTier = (t: 'free' | 'pro') => {
    const next: Record<string, IconOverride> = { ...overrides };
    for (const { name } of selected) next[name] = { ...next[name], tier: t };
    update({ overrides: next });
    flash(`Set ${selected.length} to ${t} — Save to persist`);
  };

  const bulkAssignSub = async (subId: string) => {
    setBusy(true);
    let ok = 0, fail = 0;
    for (const { name, sub } of selected) {
      if ((sub ?? '') === (subId || '')) continue;
      const r = await rawMove({ bundleId, categoryId, subcategoryId: sub, name }, { bundleId, categoryId, subcategoryId: subId || undefined });
      r.ok ? ok++ : fail++;
    }
    await reloadTree(); setSel(new Set()); setBusy(false);
    flash(`Moved ${ok}${fail ? `, ${fail} failed` : ''} — Rebuild to update`);
  };

  const bulkMove = async (to: { bundleId: string; categoryId: string; subcategoryId?: string }) => {
    setBusy(true);
    let ok = 0, fail = 0;
    for (const { name, sub } of selected) {
      const r = await rawMove({ bundleId, categoryId, subcategoryId: sub, name }, to);
      r.ok ? ok++ : fail++;
    }
    await reloadTree(); setSel(new Set()); setBulkMoving(false); setBusy(false);
    flash(`Moved ${ok}${fail ? `, ${fail} failed (name clash?)` : ''} — Rebuild to update`);
  };

  const bulkDelete = async () => {
    setBusy(true);
    let ok = 0;
    for (const { name, sub } of selected) if (await rawDelete(name, sub)) ok++;
    await reloadTree(); setSel(new Set()); setBusy(false);
    flash(`Deleted ${ok} (${bundleId}) — Rebuild to update`);
  };

  const IconRow = ({ ic, sub }: { ic: TreeIcon; sub?: string }) => {
    const ov = overrides[ic.name] ?? {};
    const tier = ov.tier ?? family.defaultTier;
    const tags = ov.tags ?? ic.name.split('-');
    const displayName = ov.name ?? ic.name.replace(/-/g, ' ');
    const checked = sel.has(selKey(ic.name, sub));
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '28px 40px 1.3fr 1.6fr 130px 108px auto', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', alignItems: 'center', background: checked ? 'var(--accent-soft)' : undefined }}>
        <input type="checkbox" checked={checked} onChange={() => toggleSel(ic.name, sub)} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }} />
        <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--foreground)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox={ic.viewBox}
            fill={ic.strokeBased ? 'none' : 'currentColor'} stroke={ic.strokeBased ? 'currentColor' : 'none'}
            strokeWidth={ic.strokeBased ? 2 : undefined} strokeLinecap="round" strokeLinejoin="round"
            dangerouslySetInnerHTML={{ __html: ic.paths.map(p => `<${p.tag} ${Object.entries(p.attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('') }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <input style={{ ...INPUT, height: 28, fontSize: 12.5 }} value={displayName} onChange={e => setOverride(ic.name, { name: e.target.value })} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--muted-2)' }}>{ic.name}.svg</span>
        </div>
        <input style={{ ...INPUT, height: 28, fontSize: 11.5, fontFamily: 'var(--font-mono)' }} value={tags.join(', ')} onChange={e => setOverride(ic.name, { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
        <select value={sub ?? ''} onChange={e => assignSub(ic, sub, e.target.value)} title="Subcategory" style={{ ...INPUT, height: 28, fontSize: 11 }}>
          <option value="">— none —</option>
          {subOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['free', 'pro'] as const).map(t => (
            <button key={t} onClick={() => setOverride(ic.name, { tier: t })} style={{ flex: 1, height: 28, borderRadius: 'var(--radius)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', cursor: 'pointer', border: 'none', background: tier === t ? (t === 'pro' ? 'var(--pro, #7C6AE8)' : 'var(--foreground)') : 'var(--surface-2)', color: tier === t ? (t === 'pro' ? '#fff' : 'var(--background)') : 'var(--muted-2)' }}>{t}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setMoving({ icon: ic, sub })} title="Move to another bundle/category" style={{ ...BTN, height: 28, padding: '0 10px', fontSize: 11 }}>Move</button>
          <button onClick={() => deleteFile(ic.name, sub)} title={`Delete this weight (${bundleId})`} style={{ height: 28, width: 28, borderRadius: 'var(--radius)', cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted-2)' }}>✕</button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ ...BTN_PRIMARY, display: 'inline-flex', alignItems: 'center', opacity: busy ? .5 : 1 }}>
          ⬆ Upload here
          <input type="file" accept=".svg,image/svg+xml" multiple disabled={busy} style={{ display: 'none' }} onChange={e => uploadHere(e.target.files)} />
        </label>
        <span style={{ fontSize: 11.5, color: 'var(--muted-2)', fontFamily: 'var(--font-mono)' }}>→ {bundleId}/{categoryId}/</span>
        <span style={{ fontSize: 10.5, color: 'var(--muted-2)', padding: '2px 7px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} title={bundle?.strokeBased ? 'Outline bundle: source = open stroked paths (fill:none forced)' : 'Fill bundle: source must be Figma-outlined (expanded) SVGs'}>
          {bundle?.strokeBased ? 'outline SVG' : 'outlined/fill SVG'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setSubModal(true)} style={BTN}>+ Add subcategory</button>
      </div>

      {selected.length > 0 && (
        <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--foreground)', color: 'var(--background)' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{selected.length} selected</span>
          <button onClick={() => setSel(new Set())} style={{ ...BTN, height: 28, fontSize: 11.5, background: 'transparent', color: 'var(--background)', border: '1px solid rgba(255,255,255,.35)' }}>Clear</button>
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,.25)' }} />
          <span style={{ fontSize: 11, opacity: .7 }}>Tier</span>
          <button disabled={busy} onClick={() => bulkTier('free')} style={{ ...BTN, height: 28, fontSize: 11, background: 'var(--background)', color: 'var(--foreground)', border: 'none' }}>Free</button>
          <button disabled={busy} onClick={() => bulkTier('pro')} style={{ ...BTN, height: 28, fontSize: 11, background: 'var(--pro, #7C6AE8)', color: '#fff', border: 'none' }}>Pro</button>
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,.25)' }} />
          <select disabled={busy} defaultValue="" onChange={e => { const v = e.target.value; e.currentTarget.selectedIndex = 0; if (v !== '') bulkAssignSub(v === '__none' ? '' : v); }}
            title="Move selected to subcategory" style={{ ...INPUT, height: 28, width: 'auto', fontSize: 11.5, background: 'var(--background)', color: 'var(--foreground)' }}>
            <option value="">Set subcategory…</option>
            <option value="__none">— none —</option>
            {subOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button disabled={busy} onClick={() => setBulkMoving(true)} style={{ ...BTN, height: 28, fontSize: 11.5, background: 'transparent', color: 'var(--background)', border: '1px solid rgba(255,255,255,.35)' }}>Move…</button>
          <button disabled={busy} onClick={bulkDelete} title={`Delete this weight (${bundleId}) for all selected`} style={{ ...BTN, height: 28, fontSize: 11.5, background: '#c0392b', color: '#fff', border: 'none' }}>Delete</button>
        </div>
      )}

      {sections.filter(s => s.sub || s.icons.length > 0).length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted-2)' }}>No icons in this category yet. Upload some above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Subcategory sections always show (even empty, so they can be renamed/deleted); the loose section only when it has icons. */}
          {sections.filter(s => s.sub || s.icons.length > 0).map(sec => (
            <div key={sec.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: sec.sub ? 'var(--foreground)' : 'var(--muted-2)' }}>{sec.label}</span>
                {sec.sub && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button title="Rename subcategory" onClick={() => onRenameSub({ type: 'subcategory', id: sec.sub!, categoryId, current: sec.label })} style={ICON_BTN}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button title="Delete subcategory (must be empty)" onClick={() => onDeleteSub({ type: 'subcategory', id: sec.sub!, categoryId, current: sec.label })} style={ICON_BTN}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                    </button>
                  </div>
                )}
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted-2)' }}>{sec.icons.length}</span>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '28px 40px 1.3fr 1.6fr 130px 108px auto', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', ...LABEL, marginBottom: 0, alignItems: 'center' }}>
                  <input type="checkbox" aria-label={`Select all in ${sec.label}`} checked={sec.icons.length > 0 && sec.icons.every(ic => sel.has(selKey(ic.name, sec.sub)))} onChange={() => {
                    const keys = sec.icons.map(ic => selKey(ic.name, sec.sub));
                    const all = keys.length > 0 && keys.every(k => sel.has(k));
                    setSel(prev => { const n = new Set(prev); keys.forEach(k => all ? n.delete(k) : n.add(k)); return n; });
                  }} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                  <span></span><span>Icon</span><span>Tags</span><span>Subcategory</span><span>Tier</span><span></span>
                </div>
                {sec.icons.map(ic => <IconRow key={ic.name} ic={ic} sub={sec.sub} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {moving && (
        <MovePicker
          family={family}
          from={{ bundleId, categoryId, subcategoryId: moving.sub, name: moving.icon.name }}
          busy={busy}
          onCancel={() => setMoving(null)}
          onMove={to => moveFile({ bundleId, categoryId, subcategoryId: moving.sub, name: moving.icon.name }, to)}
        />
      )}

      {bulkMoving && (
        <MovePicker
          family={family}
          from={{ bundleId, categoryId, name: '' }}
          count={selected.length}
          busy={busy}
          onCancel={() => setBulkMoving(false)}
          onMove={bulkMove}
        />
      )}

      {subModal && (
        <AddSubcategoryModal existing={(cat?.subcategories ?? []).map(s => s.id)} onCancel={() => setSubModal(false)} onCreate={addSubcategory} />
      )}
    </div>
  );
}

// ── Modals ───────────────────────────────────────────────────────────────────
function CreateBundleModal({ existing, onCancel, onCreate }: { existing: string[]; onCancel: () => void; onCreate: (b: BundleDef) => void }) {
  const [name, setName] = useState('');
  const [idEdited, setIdEdited] = useState(false);
  const [id, setId] = useState('');
  const [stroke, setStroke] = useState(true);
  const [strokeWidth, setStrokeWidth] = useState('1.5');
  const effId = idEdited ? id : slugify(name);
  const dup = existing.includes(effId);
  const create = () => {
    if (!effId || dup) return;
    onCreate({ id: effId, name: name.trim() || effId, strokeBased: stroke, predefined: false, ...(stroke && strokeWidth ? { strokeWidth: +strokeWidth } : {}) });
  };
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Create bundle</div>
        <label style={LABEL}>Name</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Bold" style={{ ...INPUT, marginBottom: 10 }} />
        <label style={LABEL}>ID (folder)</label>
        <input value={effId} onChange={e => { setIdEdited(true); setId(slugify(e.target.value)); }} placeholder="bold" style={{ ...INPUT, fontFamily: 'var(--font-mono)', marginBottom: dup ? 4 : 10 }} />
        {dup && <div style={{ fontSize: 11, color: '#e5645a', marginBottom: 8 }}>&quot;{effId}&quot; already exists</div>}
        <label style={LABEL}>Type</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {([['outline', true], ['fill', false]] as const).map(([lbl, v]) => (
            <button key={lbl} onClick={() => setStroke(v)} style={{ ...BTN, flex: 1, textTransform: 'capitalize', background: stroke === v ? 'var(--foreground)' : 'transparent', color: stroke === v ? 'var(--background)' : 'var(--muted)', border: stroke === v ? 'none' : '1px solid var(--border)' }}>{lbl}</button>
          ))}
        </div>
        {stroke && (
          <>
            <label style={LABEL}>Stroke width (px)</label>
            <input type="number" step="0.5" min="0.5" value={strokeWidth} onChange={e => setStrokeWidth(e.target.value)} style={{ ...INPUT, fontFamily: 'var(--font-mono)', marginBottom: 14 }} />
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={BTN}>Cancel</button>
          <button onClick={create} disabled={!effId || dup} style={{ ...BTN_PRIMARY, opacity: !effId || dup ? .5 : 1 }}>Create bundle</button>
        </div>
      </div>
    </div>
  );
}

// Edit an existing bundle: display name + paint type (outline/fill) + stroke
// width. The id (folder) is fixed. Flipping to "fill" makes the app render the
// icons as filled paths (currentColor) — use once the bundle's source SVGs are
// Figma-outlined; "outline" forces stroke rendering (fill:none + currentColor).
function EditBundleModal({ bundle, onCancel, onSave }: { bundle: BundleDef; onCancel: () => void; onSave: (patch: { name: string; strokeBased: boolean; strokeWidth?: number }) => void }) {
  const [name, setName] = useState(bundle.name);
  const [stroke, setStroke] = useState(bundle.strokeBased);
  const [strokeWidth, setStrokeWidth] = useState(String(bundle.strokeWidth ?? 1.5));
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Edit bundle</div>
        <div style={{ fontSize: 11, color: 'var(--muted-2)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>{bundle.id}</div>
        <label style={LABEL}>Name</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} style={{ ...INPUT, marginBottom: 10 }} />
        <label style={LABEL}>Type</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {([['outline', true], ['fill', false]] as const).map(([lbl, v]) => (
            <button key={lbl} onClick={() => setStroke(v)} style={{ ...BTN, flex: 1, textTransform: 'capitalize', background: stroke === v ? 'var(--foreground)' : 'transparent', color: stroke === v ? 'var(--background)' : 'var(--muted)', border: stroke === v ? 'none' : '1px solid var(--border)' }}>{lbl}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.4 }}>
          {stroke ? 'Outline: strokes forced (fill:none + currentColor). Source = open stroked paths.' : 'Fill: renders paths as-is (fill:currentColor). Source must be Figma-outlined (expanded) SVGs.'}
        </div>
        {stroke && (
          <>
            <label style={LABEL}>Stroke width (px)</label>
            <input type="number" step="0.5" min="0.5" value={strokeWidth} onChange={e => setStrokeWidth(e.target.value)} style={{ ...INPUT, fontFamily: 'var(--font-mono)', marginBottom: 14 }} />
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={BTN}>Cancel</button>
          <button onClick={() => onSave({ name: name.trim() || bundle.id, strokeBased: stroke, ...(stroke && strokeWidth ? { strokeWidth: +strokeWidth } : {}) })} style={BTN_PRIMARY}>Save bundle</button>
        </div>
      </div>
    </div>
  );
}

function AddCategoryModal({ existing, onCancel, onCreate }: { existing: string[]; onCancel: () => void; onCreate: (c: CategoryNode) => void }) {
  const [name, setName] = useState('');
  const [idEdited, setIdEdited] = useState(false);
  const [id, setId] = useState('');
  const effId = idEdited ? id : slugify(name);
  const dup = existing.includes(effId);
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 380, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Add category</div>
        <label style={LABEL}>Name</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Interface" style={{ ...INPUT, marginBottom: 10 }} />
        <label style={LABEL}>ID (folder)</label>
        <input value={effId} onChange={e => { setIdEdited(true); setId(slugify(e.target.value)); }} placeholder="interface" style={{ ...INPUT, fontFamily: 'var(--font-mono)', marginBottom: dup ? 4 : 14 }} />
        {dup && <div style={{ fontSize: 11, color: '#e5645a', marginBottom: 8 }}>&quot;{effId}&quot; already exists</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={BTN}>Cancel</button>
          <button onClick={() => effId && !dup && onCreate({ id: effId, name: name.trim() || effId, subcategories: [] })} disabled={!effId || dup} style={{ ...BTN_PRIMARY, opacity: !effId || dup ? .5 : 1 }}>Add category</button>
        </div>
      </div>
    </div>
  );
}

function AddSubcategoryModal({ existing, onCancel, onCreate }: { existing: string[]; onCancel: () => void; onCreate: (s: { id: string; name: string }) => void }) {
  const [name, setName] = useState('');
  const [idEdited, setIdEdited] = useState(false);
  const [id, setId] = useState('');
  const effId = idEdited ? id : slugify(name);
  const dup = existing.includes(effId);
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 380, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Add subcategory</div>
        <label style={LABEL}>Name</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Cart" style={{ ...INPUT, marginBottom: 10 }} />
        <label style={LABEL}>ID (folder)</label>
        <input value={effId} onChange={e => { setIdEdited(true); setId(slugify(e.target.value)); }} placeholder="cart" style={{ ...INPUT, fontFamily: 'var(--font-mono)', marginBottom: dup ? 4 : 14 }} />
        {dup && <div style={{ fontSize: 11, color: '#e5645a', marginBottom: 8 }}>&quot;{effId}&quot; already exists</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={BTN}>Cancel</button>
          <button onClick={() => effId && !dup && onCreate({ id: effId, name: name.trim() || effId })} disabled={!effId || dup} style={{ ...BTN_PRIMARY, opacity: !effId || dup ? .5 : 1 }}>Add subcategory</button>
        </div>
      </div>
    </div>
  );
}

function RenameModal({ target, onCancel, onSave }: { target: TaxTarget; onCancel: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(target.current);
  const label = target.type === 'bundle' ? 'bundle' : target.type === 'category' ? 'category' : 'subcategory';
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 360, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, textTransform: 'capitalize' }}>Rename {label}</div>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted-2)' }}>Changes the display name only. The folder id (<code style={{ fontFamily: 'var(--font-mono)' }}>{target.id}</code>) stays the same.</p>
        <label style={LABEL}>Name</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name); }} style={{ ...INPUT, marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={BTN}>Cancel</button>
          <button onClick={() => onSave(name)} disabled={!name.trim()} style={{ ...BTN_PRIMARY, opacity: name.trim() ? 1 : .5 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function TaxDeleteModal({ target, onCancel, onConfirm }: { target: TaxTarget; onCancel: () => void; onConfirm: () => void }) {
  const label = target.type === 'bundle' ? 'bundle' : target.type === 'category' ? 'category' : 'subcategory';
  const scope = target.type === 'category' ? ' its folder in every bundle' : target.type === 'subcategory' ? ' its folder in every bundle' : ' its folder';
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, textTransform: 'capitalize' }}>Delete {label}</div>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
          Remove <strong style={{ color: 'var(--foreground)' }}>{target.current}</strong> and{scope} from disk. This only works if it holds <strong style={{ color: 'var(--foreground)' }}>no icons</strong> — move or delete the icons first otherwise.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={BTN}>Cancel</button>
          <button onClick={onConfirm} style={{ ...BTN, background: '#c0392b', color: '#fff', border: 'none' }}>Delete {label}</button>
        </div>
      </div>
    </div>
  );
}

function MovePicker({ family, from, busy, count, onCancel, onMove }: {
  family: FamilyMeta;
  from: { bundleId: string; categoryId: string; subcategoryId?: string; name: string };
  busy: boolean;
  count?: number; // when set, this is a bulk move of `count` icons
  onCancel: () => void;
  onMove: (to: { bundleId: string; categoryId: string; subcategoryId?: string }) => void;
}) {
  const [bundleId, setBundleId] = useState(from.bundleId);
  const [categoryId, setCategoryId] = useState(from.categoryId);
  const [subcategoryId, setSubcategoryId] = useState(from.subcategoryId ?? '');
  const subs = family.categories.find(c => c.id === categoryId)?.subcategories ?? [];
  const bulk = count !== undefined;
  const unchanged = !bulk && bundleId === from.bundleId && categoryId === from.categoryId && (subcategoryId || undefined) === from.subcategoryId;

  return (
    <div onClick={() => !busy && onCancel()} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{bulk ? `Move ${count} icons` : <>Move <code style={{ fontFamily: 'var(--font-mono)' }}>{from.name}</code></>}</div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--muted)' }}>Relocates this one weight ({from.bundleId}). Won&apos;t overwrite an existing file at the destination.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div><label style={LABEL}>Bundle</label>
            <select style={INPUT} value={bundleId} onChange={e => setBundleId(e.target.value)}>{family.bundles.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </div>
          <div><label style={LABEL}>Category</label>
            <select style={INPUT} value={categoryId} onChange={e => { setCategoryId(e.target.value); setSubcategoryId(''); }}>{family.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </div>
          <div><label style={LABEL}>Subcategory</label>
            <select style={INPUT} value={subcategoryId} onChange={e => setSubcategoryId(e.target.value)}><option value="">— none —</option>{subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={busy} style={BTN}>Cancel</button>
          <button onClick={() => onMove({ bundleId, categoryId, subcategoryId: subcategoryId || undefined })} disabled={busy || unchanged} style={{ ...BTN_PRIMARY, opacity: busy || unchanged ? .5 : 1 }}>{busy ? 'Moving…' : 'Move'}</button>
        </div>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
