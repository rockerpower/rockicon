'use client';
import { useState, useCallback } from 'react';
import type { FamilyMeta, BundleDef, CategoryNode, SubcategoryNode, Credit, IconOverride } from '@/types';
import type { FamilySummary, SourceIcon } from '@/lib/studio';
import { PREDEFINED_BUNDLES, DEFAULT_LICENSES } from '@/taxonomy.config';

interface Props {
  families: FamilySummary[];
}

type Tab = 'meta' | 'bundles' | 'categories' | 'icons';

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ── small styled primitives ─────────────────────────────────────────────────
const LABEL: React.CSSProperties = { fontFamily: 'monospace', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 6, display: 'block' };
const INPUT: React.CSSProperties = { width: '100%', height: 34, padding: '0 10px', background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)', fontSize: 13, outline: 'none' };
const BTN: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--foreground)' };
const BTN_PRIMARY: React.CSSProperties = { ...BTN, background: 'var(--foreground)', color: 'var(--background)', border: 'none' };

export function StudioShell({ families }: Props) {
  const [list, setList] = useState<FamilySummary[]>(families);
  const [slug, setSlug] = useState<string | null>(null);
  const [family, setFamily] = useState<FamilyMeta | null>(null);
  const [icons, setIcons] = useState<SourceIcon[]>([]);
  const [tab, setTab] = useState<Tab>('meta');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }, []);

  const loadFamily = useCallback(async (s: string) => {
    setLoading(true);
    setSlug(s);
    try {
      const [fRes, iRes] = await Promise.all([
        fetch(`/api/studio/family/${s}`),
        fetch(`/api/studio/family/${s}/icons`),
      ]);
      const fData = await fRes.json();
      const iData = await iRes.json();
      if (fRes.ok) { setFamily(fData.family); setIcons(iRes.ok ? iData.icons : []); setDirty(false); setTab('meta'); }
      else flash(fData.error ?? 'Load failed');
    } catch { flash('Load failed'); }
    setLoading(false);
  }, [flash]);

  const update = useCallback((patch: Partial<FamilyMeta>) => {
    setFamily(prev => prev ? { ...prev, ...patch } : prev);
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!family || !slug) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/studio/family/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ family }),
      });
      const data = await res.json();
      if (res.ok) { setDirty(false); flash('Saved to family.json'); }
      else flash(data.error ?? 'Save failed');
    } catch { flash('Save failed'); }
    setSaving(false);
  }, [family, slug, flash]);

  const reloadIcons = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/studio/family/${slug}/icons`);
      const data = await res.json();
      if (res.ok) setIcons(data.icons);
    } catch { /* ignore */ }
  }, [slug]);

  // Re-fetch family.json without resetting the active tab (used after a bulk
  // import auto-creates taxonomy on the server).
  const reloadFamily = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/studio/family/${slug}`);
      const data = await res.json();
      if (res.ok) { setFamily(data.family); setDirty(false); }
    } catch { /* ignore */ }
  }, [slug]);

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
        setSlug(null); setFamily(null); setIcons([]);
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
      bundles: PREDEFINED_BUNDLES.filter(b => b.id === 'outline' || b.id === 'solid')
        .map(b => ({ id: b.id, name: b.name, strokeBased: b.strokeBased, predefined: true })),
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

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--background)', color: 'var(--foreground)', overflow: 'hidden' }}>
      {/* Sidebar: family list */}
      <aside style={{ flex: '0 0 240px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Studio</span>
          <a href="/" style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'none' }}>← Browse</a>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', marginBottom: 2 }}>
            <span style={LABEL}>Families</span>
            <button onClick={() => { setNewName(''); setNewOpen(true); }} title="New family" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>+ New</button>
          </div>
          {list.map(f => (
            <button
              key={f.slug}
              onClick={() => loadFamily(f.slug)}
              style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: slug === f.slug ? 'var(--surface-2)' : 'transparent', color: 'var(--foreground)', marginBottom: 2 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</span>
              <span style={{ fontSize: 10.5, color: 'var(--muted-2)', fontFamily: 'monospace' }}>{f.slug} · {f.iconCount} svg · {f.status}</span>
            </button>
          ))}
          {list.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--muted-2)' }}>No families in icons-source/</div>}
        </div>
      </aside>

      {/* Main editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!family ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-2)', fontSize: 14 }}>
            {loading ? 'Loading…' : 'Select a family to edit'}
          </div>
        ) : (
          <>
            {/* Header */}
            <header style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['meta', 'bundles', 'categories', 'icons'] as Tab[]).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{ height: 32, padding: '0 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, textTransform: 'capitalize', cursor: 'pointer', border: 'none', background: tab === t ? 'var(--surface-2)' : 'transparent', color: tab === t ? 'var(--foreground)' : 'var(--muted)' }}>{t}</button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              {dirty && <span style={{ fontSize: 11, color: 'var(--muted-2)', fontFamily: 'monospace' }}>unsaved</span>}
              <button onClick={rebuild} disabled={building} style={{ ...BTN, opacity: building ? .5 : 1 }}>{building ? 'Building…' : 'Rebuild'}</button>
              <button onClick={exportJson} style={BTN}>Export JSON</button>
              <button onClick={save} disabled={saving || !dirty} style={{ ...BTN_PRIMARY, opacity: saving || !dirty ? .5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
              <div style={{ maxWidth: tab === 'icons' ? 980 : 640 }}>
                {tab === 'meta' && <MetaTab family={family} update={update} onRequestDelete={() => { setDelText(''); setDelOpen(true); }} />}
                {tab === 'bundles' && <BundlesTab family={family} update={update} />}
                {tab === 'categories' && <CategoriesTab family={family} update={update} />}
                {tab === 'icons' && <IconsTab family={family} icons={icons} update={update} slug={slug!} onReload={reloadIcons} onReloadFamily={reloadFamily} flash={flash} />}
              </div>
            </div>
          </>
        )}
      </div>

      {/* New family */}
      {newOpen && (
        <div onClick={() => !creating && setNewOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 380, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 10 }}>New family</div>
            <label style={LABEL}>Name</label>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newSlug) createFamily(); }} placeholder="My Icons" style={{ ...INPUT, marginBottom: 8 }} />
            <div style={{ fontSize: 11.5, color: 'var(--muted-2)', marginBottom: 14 }}>
              Slug: <code style={{ fontFamily: 'monospace', color: 'var(--muted)' }}>{newSlug || '—'}</code> · starts as <strong style={{ color: 'var(--muted)' }}>draft</strong> with outline + solid bundles. Set Status = published in Meta to go live.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setNewOpen(false)} disabled={creating} style={BTN}>Cancel</button>
              <button onClick={createFamily} disabled={creating || !newSlug} style={{ ...BTN_PRIMARY, opacity: creating || !newSlug ? .5 : 1 }}>{creating ? 'Creating…' : 'Create family'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete-family confirm (type the slug) */}
      {delOpen && family && (
        <div onClick={() => !deleting && setDelOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 400, padding: 24, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Delete family</div>
            <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              This permanently removes <strong style={{ color: 'var(--foreground)' }}>{family.name}</strong> and all its icons from <code style={{ fontFamily: 'monospace' }}>icons-source/{family.slug}/</code>. This cannot be undone.
            </p>
            <label style={LABEL}>Type <code style={{ fontFamily: 'monospace', color: 'var(--foreground)' }}>{family.slug}</code> to confirm</label>
            <input autoFocus value={delText} onChange={e => setDelText(e.target.value)} placeholder={family.slug} style={{ ...INPUT, fontFamily: 'monospace', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDelOpen(false)} disabled={deleting} style={BTN}>Cancel</button>
              <button
                onClick={deleteFamily}
                disabled={deleting || delText !== family.slug}
                style={{ ...BTN, background: '#c0392b', color: '#fff', border: 'none', opacity: deleting || delText !== family.slug ? .5 : 1 }}
              >
                {deleting ? 'Deleting…' : 'Delete family'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-in" style={{ position: 'fixed', bottom: 24, left: '50%', zIndex: 99, height: 40, display: 'flex', alignItems: 'center', padding: '0 16px', background: 'var(--foreground)', color: 'var(--background)', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Meta tab ─────────────────────────────────────────────────────────────────
function MetaTab({ family, update, onRequestDelete }: { family: FamilyMeta; update: (p: Partial<FamilyMeta>) => void; onRequestDelete: () => void }) {
  const setAuthor = (i: number, patch: Partial<Credit>) => {
    const authors = family.authors.map((a, idx) => idx === i ? { ...a, ...patch } : a);
    update({ authors });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Row><label style={LABEL}>Name</label><input style={INPUT} value={family.name} onChange={e => update({ name: e.target.value })} /></Row>
      <Row><label style={LABEL}>Slug (folder name — matches icons-source/)</label><input style={{ ...INPUT, fontFamily: 'monospace' }} value={family.slug} onChange={e => update({ slug: slugify(e.target.value) })} /></Row>
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
        <Row><label style={LABEL}>Version</label><input style={{ ...INPUT, fontFamily: 'monospace' }} value={family.version ?? ''} onChange={e => update({ version: e.target.value })} /></Row>
        <Row><label style={LABEL}>Base grid</label><input type="number" style={{ ...INPUT, fontFamily: 'monospace' }} value={family.baseGrid ?? 24} onChange={e => update({ baseGrid: +e.target.value })} /></Row>
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

      {/* Danger zone */}
      <div style={{ marginTop: 12, padding: 16, border: '1px solid #5a2a26', borderRadius: 12, background: 'rgba(192,57,43,.06)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#e5645a', marginBottom: 4 }}>Danger zone</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Permanently delete this family and all its icons.</span>
          <button onClick={onRequestDelete} style={{ ...BTN, flexShrink: 0, background: 'transparent', color: '#e5645a', border: '1px solid #5a2a26' }}>Delete family</button>
        </div>
      </div>
    </div>
  );
}

// ── Bundles tab ──────────────────────────────────────────────────────────────
function BundlesTab({ family, update }: { family: FamilyMeta; update: (p: Partial<FamilyMeta>) => void }) {
  const setBundle = (i: number, patch: Partial<BundleDef>) => update({ bundles: family.bundles.map((b, idx) => idx === i ? { ...b, ...patch } : b) });
  const addBundle = (preset?: typeof PREDEFINED_BUNDLES[number]) => {
    const base: BundleDef = preset
      ? { id: preset.id, name: preset.name, strokeBased: preset.strokeBased, predefined: true }
      : { id: 'custom', name: 'Custom', strokeBased: false, predefined: false };
    if (family.bundles.some(b => b.id === base.id)) return;
    update({ bundles: [...family.bundles, base] });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {family.bundles.map((b, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'center', padding: 10, border: '1px solid var(--border)', borderRadius: 10 }}>
            <div><label style={LABEL}>ID (folder)</label><input style={{ ...INPUT, fontFamily: 'monospace' }} value={b.id} onChange={e => setBundle(i, { id: slugify(e.target.value) })} /></div>
            <div><label style={LABEL}>Name</label><input style={INPUT} value={b.name} onChange={e => setBundle(i, { name: e.target.value })} /></div>
            <div><label style={LABEL}>Render</label>
              <button onClick={() => setBundle(i, { strokeBased: !b.strokeBased })} style={{ ...BTN, width: 90 }}>{b.strokeBased ? 'stroke' : 'fill'}</button>
            </div>
            <div><label style={{ ...LABEL, opacity: 0 }}>x</label><button onClick={() => update({ bundles: family.bundles.filter((_, idx) => idx !== i) })} style={{ ...BTN, width: 34, padding: 0 }}>✕</button></div>
          </div>
        ))}
      </div>
      <div>
        <label style={LABEL}>Add predefined bundle</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PREDEFINED_BUNDLES.filter(p => !family.bundles.some(b => b.id === p.id)).map(p => (
            <button key={p.id} onClick={() => addBundle(p)} style={BTN}>+ {p.name}</button>
          ))}
          <button onClick={() => addBundle()} style={{ ...BTN, borderStyle: 'dashed' }}>+ Custom</button>
        </div>
      </div>
    </div>
  );
}

// ── Categories tab ───────────────────────────────────────────────────────────
function CategoriesTab({ family, update }: { family: FamilyMeta; update: (p: Partial<FamilyMeta>) => void }) {
  const setCat = (i: number, patch: Partial<CategoryNode>) => update({ categories: family.categories.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  const setSub = (ci: number, si: number, patch: Partial<SubcategoryNode>) => {
    const cat = family.categories[ci];
    const subcategories = cat.subcategories.map((s, idx) => idx === si ? { ...s, ...patch } : s);
    setCat(ci, { subcategories });
  };
  const addCat = () => update({ categories: [...family.categories, { id: 'new-category', name: 'New Category', subcategories: [] }] });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {family.categories.map((cat, ci) => (
        <div key={ci} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 10 }}>
            <div><label style={LABEL}>Category ID (folder)</label><input style={{ ...INPUT, fontFamily: 'monospace' }} value={cat.id} onChange={e => setCat(ci, { id: slugify(e.target.value) })} /></div>
            <div><label style={LABEL}>Name</label><input style={INPUT} value={cat.name} onChange={e => setCat(ci, { name: e.target.value })} /></div>
            <button onClick={() => update({ categories: family.categories.filter((_, idx) => idx !== ci) })} style={{ ...BTN, width: 34, padding: 0 }}>✕</button>
          </div>
          <label style={LABEL}>Subcategories</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
            {cat.subcategories.map((sub, si) => (
              <div key={si} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
                <input style={{ ...INPUT, fontFamily: 'monospace', height: 30 }} value={sub.id} onChange={e => setSub(ci, si, { id: slugify(e.target.value) })} />
                <input style={{ ...INPUT, height: 30 }} value={sub.name} onChange={e => setSub(ci, si, { name: e.target.value })} />
                <button onClick={() => setCat(ci, { subcategories: cat.subcategories.filter((_, idx) => idx !== si) })} style={{ ...BTN, width: 30, height: 30, padding: 0 }}>✕</button>
              </div>
            ))}
            <button onClick={() => setCat(ci, { subcategories: [...cat.subcategories, { id: 'new-sub', name: 'New Subcategory' }] })} style={{ ...BTN, alignSelf: 'flex-start', height: 30 }}>+ Subcategory</button>
          </div>
        </div>
      ))}
      <button onClick={addCat} style={{ ...BTN, alignSelf: 'flex-start' }}>+ Add category</button>
    </div>
  );
}

// ── SVG upload / ingest ──────────────────────────────────────────────────────
// Folder-mode staged items carry their own bundle/category/subcategory (parsed
// from the folder path); file-mode items fall back to the dropdowns.
interface StagedSvg { name: string; svg: string; error?: string; bundleId?: string; categoryId?: string; subcategoryId?: string }

function UploadPanel({ family, slug, onReload, onReloadFamily, flash }: { family: FamilyMeta; slug: string; onReload: () => void; onReloadFamily: () => void; flash: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [bundleId, setBundleId] = useState(family.bundles[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(family.categories[0]?.id ?? '');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [staged, setStaged] = useState<StagedSvg[]>([]);
  const [busy, setBusy] = useState(false);
  const [showTpl, setShowTpl] = useState(false);

  const cat = family.categories.find(c => c.id === categoryId);
  const subs = cat?.subcategories ?? [];
  const isSafe = (t: string) => /<svg[\s>]/i.test(t) && !/<script|on\w+\s*=/i.test(t);

  // Single-category: assign the dropdown target at submit time.
  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: StagedSvg[] = [];
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.svg')) continue;
      const text = await file.text();
      const name = file.name.replace(/\.svg$/i, '');
      next.push({ name, svg: text, error: isSafe(text) ? undefined : 'invalid/unsafe' });
    }
    setStaged(prev => [...prev, ...next]);
  };

  // Folder: derive bundle/category/[sub] from <root>/<bundle>/<cat>/[<sub>/]<name>.svg
  const onFolder = async (files: FileList | null) => {
    if (!files) return;
    const next: StagedSvg[] = [];
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.svg')) continue;
      const rel = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = rel.split('/').filter(Boolean).slice(1); // drop the picked root folder
      const name = (parts[parts.length - 1] || file.name).replace(/\.svg$/i, '');
      let bundleId: string | undefined, categoryId: string | undefined, subcategoryId: string | undefined, error: string | undefined;
      if (parts.length === 3) { bundleId = slugify(parts[0]); categoryId = slugify(parts[1]); }
      else if (parts.length === 4) { bundleId = slugify(parts[0]); categoryId = slugify(parts[1]); subcategoryId = slugify(parts[2]); }
      else error = 'bad path (need bundle/category/name.svg)';
      const text = await file.text();
      if (!error && !isSafe(text)) error = 'invalid/unsafe';
      next.push({ name, svg: text, error, bundleId, categoryId, subcategoryId });
    }
    setStaged(prev => [...prev, ...next]);
  };

  const targetOf = (s: StagedSvg) => ({
    bundleId: s.bundleId ?? bundleId,
    categoryId: s.categoryId ?? categoryId,
    subcategoryId: (s.bundleId ? s.subcategoryId : subcategoryId) || undefined,
  });

  const submit = async () => {
    const valid = staged.filter(s => !s.error);
    if (valid.length === 0) { flash('Nothing to upload'); return; }
    setBusy(true);
    try {
      const items = valid.map(s => ({ ...targetOf(s), name: s.name, svg: s.svg }));
      const res = await fetch(`/api/studio/family/${slug}/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // Always auto-create the target bundle/category if missing — avoids the
        // "unknown category" footgun for both folder and single-category uploads.
        body: JSON.stringify({ items, autoCreateTaxonomy: true }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        flash(`Uploaded ${data.written.length} icon(s)`); setStaged([]); onReload(); onReloadFamily();
      } else flash(data.errors?.[0] ?? data.error ?? 'Upload failed');
    } catch { flash('Upload failed'); }
    setBusy(false);
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'transparent', border: 'none', color: 'var(--foreground)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
        <span>Upload icons {staged.length > 0 && <span style={{ color: 'var(--muted-2)', fontWeight: 400 }}>· {staged.length} staged</span>}</span>
        <span style={{ color: 'var(--muted-2)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ ...BTN, display: 'inline-flex', alignItems: 'center' }}>
              Choose .svg files
              <input type="file" accept=".svg,image/svg+xml" multiple style={{ display: 'none' }} onChange={e => onFiles(e.target.files)} />
            </label>
            <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>to <strong style={{ color: 'var(--muted)' }}>{bundleId}/{categoryId}{subcategoryId ? '/' + subcategoryId : ''}</strong></span>
            <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
            <label style={{ ...BTN, display: 'inline-flex', alignItems: 'center' }}>
              Choose folder (bulk)
              <input type="file" style={{ display: 'none' }} onChange={e => onFolder(e.target.files)} {...{ webkitdirectory: '', directory: '' } as Record<string, string>} />
            </label>
            <button type="button" onClick={() => setShowTpl(t => !t)} style={{ background: 'transparent', border: 'none', color: 'var(--muted-2)', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>folder structure?</button>
          </div>

          {showTpl && (
            <pre style={{ margin: 0, padding: '10px 12px', background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.5, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{`your-folder/
  outline/            ← bundle (outline=stroke, solid=fill)
    interface/        ← category
      home.svg
    navigation/
      wayfinding/     ← optional subcategory
        compass.svg
  solid/
    interface/
      home.svg        ← same filename = same icon (another style)

Missing bundles/categories are created automatically.`}</pre>
          )}

          {staged.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
              {staged.map((s, i) => {
                const t = targetOf(s);
                return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'monospace', color: s.error ? '#e5645a' : 'var(--muted)' }}>
                  <span style={{ flex: 1 }}>{t.bundleId}/{t.categoryId}{t.subcategoryId ? '/' + t.subcategoryId : ''}/{slugify(s.name)}.svg{s.error ? `  (${s.error})` : ''}</span>
                  <button onClick={() => setStaged(prev => prev.filter((_, idx) => idx !== i))} style={{ ...BTN, width: 24, height: 24, padding: 0, fontSize: 11 }}>✕</button>
                </div>
                );
              })}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button onClick={submit} disabled={busy} style={{ ...BTN_PRIMARY, opacity: busy ? .5 : 1 }}>{busy ? 'Uploading…' : `Upload ${staged.filter(s => !s.error).length} icon(s)`}</button>
                <button onClick={() => setStaged([])} style={BTN}>Clear</button>
              </div>
              <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>After upload, click Rebuild to regenerate the public index.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Icons tab (per-icon overrides: display name, tier, tags) ─────────────────
function IconsTab({ family, icons, update, slug, onReload, onReloadFamily, flash }: { family: FamilyMeta; icons: SourceIcon[]; update: (p: Partial<FamilyMeta>) => void; slug: string; onReload: () => void; onReloadFamily: () => void; flash: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [pendingDel, setPendingDel] = useState<string | null>(null);
  const overrides = family.overrides ?? {};

  // Write an override for one icon, pruning it back out when it matches defaults.
  const setOverride = (name: string, patch: Partial<IconOverride>) => {
    const next: Record<string, IconOverride> = { ...overrides };
    const merged: IconOverride = { ...next[name], ...patch };
    // prune keys that are undefined/empty
    if (merged.tags && merged.tags.length === 0) delete merged.tags;
    if (merged.name === '') delete merged.name;
    if (Object.keys(merged).length === 0) delete next[name];
    else next[name] = merged;
    update({ overrides: next });
  };

  // Delete one icon (all its .svg files) + drop its override locally.
  const deleteIcon = async (name: string) => {
    try {
      const res = await fetch(`/api/studio/family/${slug}/icons/${name}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        if (overrides[name]) {
          const next = { ...overrides }; delete next[name];
          update({ overrides: Object.keys(next).length ? next : undefined });
        }
        flash(`Deleted ${name} — Rebuild to update`);
        onReload();
      } else flash(data.error ?? 'Delete failed');
    } catch { flash('Delete failed'); }
    setPendingDel(null);
  };

  const filtered = q.trim()
    ? icons.filter(ic => ic.name.includes(q.trim().toLowerCase()))
    : icons;

  const proCount = icons.filter(ic => (overrides[ic.name]?.tier ?? family.defaultTier) === 'pro').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <UploadPanel family={family} slug={slug} onReload={onReload} onReloadFamily={onReloadFamily} flash={flash} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input style={{ ...INPUT, flex: 1, maxWidth: 280 }} placeholder="Filter icons…" value={q} onChange={e => setQ(e.target.value)} />
        <span style={{ fontSize: 12, color: 'var(--muted-2)', fontFamily: 'monospace' }}>{icons.length} icons · {proCount} pro</span>
      </div>

      {icons.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--muted-2)' }}>No SVGs found in icons-source/{family.slug}/</div>}

      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {/* header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1.4fr 1fr 1fr 2fr 120px 44px', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', ...LABEL, marginBottom: 0 }}>
          <span></span><span>Icon</span><span>Category</span><span>Bundles</span><span>Tags</span><span>Tier</span><span></span>
        </div>
        {filtered.map(ic => {
          const ov = overrides[ic.name] ?? {};
          const tier = ov.tier ?? family.defaultTier;
          const tags = ov.tags ?? ic.name.split('-');
          const displayName = ov.name ?? ic.name.replace(/-/g, ' ');
          return (
            <div key={ic.name} style={{ display: 'grid', gridTemplateColumns: '40px 1.4fr 1fr 1fr 2fr 120px 44px', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--foreground)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox={ic.viewBox}
                  fill={ic.strokeBased ? 'none' : 'currentColor'} stroke={ic.strokeBased ? 'currentColor' : 'none'}
                  strokeWidth={ic.strokeBased ? 2 : undefined} strokeLinecap="round" strokeLinejoin="round"
                  dangerouslySetInnerHTML={{ __html: ic.paths.map(p => `<${p.tag} ${Object.entries(p.attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('') }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <input style={{ ...INPUT, height: 28, fontSize: 12.5 }} value={displayName} onChange={e => setOverride(ic.name, { name: e.target.value })} />
                <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: 'var(--muted-2)' }}>{ic.name}.svg</span>
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'monospace' }}>{ic.categoryId}{ic.subcategoryId ? ` / ${ic.subcategoryId}` : ''}</span>
              <span style={{ fontSize: 10.5, color: 'var(--muted-2)', fontFamily: 'monospace' }}>{ic.bundles.join(', ')}</span>
              <input style={{ ...INPUT, height: 28, fontSize: 11.5, fontFamily: 'monospace' }} value={tags.join(', ')} onChange={e => setOverride(ic.name, { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
              <div style={{ display: 'flex', gap: 4 }}>
                {(['free', 'pro'] as const).map(t => (
                  <button key={t} onClick={() => setOverride(ic.name, { tier: t })} style={{ flex: 1, height: 28, borderRadius: 7, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', cursor: 'pointer', border: 'none', background: tier === t ? (t === 'pro' ? 'var(--pro, #7C6AE8)' : 'var(--foreground)') : 'var(--surface-2)', color: tier === t ? (t === 'pro' ? '#fff' : 'var(--background)') : 'var(--muted-2)' }}>{t}</button>
                ))}
              </div>
              {pendingDel === ic.name ? (
                <button onClick={() => deleteIcon(ic.name)} onBlur={() => setPendingDel(null)} autoFocus title="Click to confirm delete" style={{ height: 28, borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: 'pointer', border: 'none', background: '#c0392b', color: '#fff' }}>Sure?</button>
              ) : (
                <button onClick={() => setPendingDel(ic.name)} title={`Delete ${ic.name}.svg`} style={{ height: 28, borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted-2)' }}>✕</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
