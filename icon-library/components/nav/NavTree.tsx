'use client';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { FamilyMeta } from '@/types';

interface Props {
  families: FamilyMeta[];
  currentFamily: string;
  currentBundle: string;
  currentCategory: string;
}

const ROW = 'flex items-center gap-1 h-[28px] px-2 rounded-[7px] cursor-pointer select-none transition-colors hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--foreground)]';
const LABEL = 'text-[12.5px] truncate';

type RowKind = 'family' | 'bundle' | 'all' | 'category';

interface Row {
  key: string;
  kind: RowKind;
  label: string;
  level: number;         // 0 family, 1 bundle, 2 leaf
  expandable: boolean;
  expanded: boolean;
  active: boolean;
  familySlug: string;
  bundleId?: string;
  categoryId?: string;   // for leaf navigation
}

export function NavTree({ families, currentFamily, currentBundle, currentCategory }: Props) {
  const router = useRouter();
  const [focusIdx, setFocusIdx] = useState(0);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // expand state: key = "f:<slug>" | "b:<slug>:<bundleId>"
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const fam of families) {
      init[`f:${fam.slug}`] = true;
      for (const b of fam.bundles) {
        if (fam.slug === currentFamily && b.id === currentBundle) {
          init[`b:${fam.slug}:${b.id}`] = true;
        }
      }
    }
    return init;
  });

  const toggle = useCallback((key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const navigate = useCallback((family: string, bundle: string, category: string) => {
    router.push(`/${family}/${bundle}/${category}`);
  }, [router]);

  // Flatten the visible tree into an ordered list of rows.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const fam of families) {
      const famKey = `f:${fam.slug}`;
      const famOpen = !!expanded[famKey];
      out.push({ key: famKey, kind: 'family', label: fam.name, level: 0, expandable: true, expanded: famOpen, active: false, familySlug: fam.slug });
      if (!famOpen) continue;
      for (const bundle of fam.bundles) {
        const bKey = `b:${fam.slug}:${bundle.id}`;
        const bOpen = !!expanded[bKey];
        const bActive = fam.slug === currentFamily && bundle.id === currentBundle;
        out.push({ key: bKey, kind: 'bundle', label: bundle.name, level: 1, expandable: true, expanded: bOpen, active: bActive, familySlug: fam.slug, bundleId: bundle.id });
        if (!bOpen) continue;
        out.push({ key: `${bKey}:__all__`, kind: 'all', label: 'All', level: 2, expandable: false, expanded: false, active: bActive && currentCategory === '__all__', familySlug: fam.slug, bundleId: bundle.id, categoryId: '__all__' });
        for (const cat of fam.categories) {
          out.push({ key: `${bKey}:${cat.id}`, kind: 'category', label: cat.name, level: 2, expandable: false, expanded: false, active: bActive && currentCategory === cat.id, familySlug: fam.slug, bundleId: bundle.id, categoryId: cat.id });
        }
      }
    }
    return out;
  }, [families, expanded, currentFamily, currentBundle, currentCategory]);

  // Keep focus index in range as rows expand/collapse.
  useEffect(() => {
    if (focusIdx > rows.length - 1) setFocusIdx(Math.max(0, rows.length - 1));
  }, [rows.length, focusIdx]);

  const activateRow = useCallback((row: Row) => {
    if (row.kind === 'family') {
      toggle(row.key);
    } else if (row.kind === 'bundle') {
      toggle(row.key);
      if (!row.active) {
        const fam = families.find(f => f.slug === row.familySlug);
        const firstCat = fam?.categories[0];
        if (firstCat && row.bundleId) navigate(row.familySlug, row.bundleId, firstCat.id);
      }
    } else if (row.bundleId && row.categoryId) {
      navigate(row.familySlug, row.bundleId, row.categoryId);
    }
  }, [toggle, families, navigate]);

  const focusRow = (idx: number) => {
    setFocusIdx(idx);
    rowRefs.current[idx]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    const row = rows[idx];
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusRow(Math.min(idx + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusRow(Math.max(idx - 1, 0));
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (row.expandable && !row.expanded) toggle(row.key);
        else if (row.expandable && row.expanded) focusRow(Math.min(idx + 1, rows.length - 1));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (row.expandable && row.expanded) toggle(row.key);
        else {
          // jump to parent row (previous row with a lower level)
          for (let j = idx - 1; j >= 0; j--) {
            if (rows[j].level < row.level) { focusRow(j); break; }
          }
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        activateRow(row);
        break;
    }
  };

  const leafDot = (active: boolean) => (
    <span
      style={{
        width: 4, height: 4, borderRadius: '50%', flexShrink: 0, marginRight: 4,
        background: active ? 'var(--foreground)' : 'var(--border-2)',
        border: active ? undefined : '1px solid var(--border-2)',
      }}
    />
  );

  return (
    <nav className="flex-1 overflow-y-auto py-2 px-2" role="tree" aria-label="Icon library">
      <div
        className="px-2 pb-1.5 pt-1"
        style={{ fontFamily: 'monospace', fontSize: '9px', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)' }}
      >
        Library
      </div>

      {rows.map((row, idx) => (
        <div
          key={row.key}
          ref={el => { rowRefs.current[idx] = el; }}
          className={ROW}
          role="treeitem"
          aria-level={row.level + 1}
          aria-expanded={row.expandable ? row.expanded : undefined}
          aria-selected={row.active}
          tabIndex={idx === focusIdx ? 0 : -1}
          style={{
            paddingLeft: row.level === 0 ? undefined : row.level === 1 ? 22 : 38,
            background: row.active && row.kind !== 'bundle' ? 'var(--surface-2)' : undefined,
          }}
          onKeyDown={e => onKeyDown(e, idx)}
          onFocus={() => setFocusIdx(idx)}
          onClick={() => { setFocusIdx(idx); activateRow(row); }}
        >
          {row.expandable ? (
            <span
              style={{ fontSize: '9px', color: 'var(--muted-2)', width: 14, textAlign: 'center', flexShrink: 0 }}
              onClick={e => { e.stopPropagation(); toggle(row.key); }}
            >
              {row.expanded ? '▾' : '▸'}
            </span>
          ) : (
            <>
              <span style={{ width: 10, flexShrink: 0 }} />
              {leafDot(row.active)}
            </>
          )}
          <span
            className={LABEL}
            style={{
              fontWeight: row.kind === 'family' ? 700 : row.active ? (row.kind === 'bundle' ? 600 : 700) : row.kind === 'all' || row.kind === 'category' ? (row.active ? 700 : 500) : 500,
              color: row.kind === 'family' || row.active ? 'var(--foreground)' : 'var(--muted)',
            }}
          >
            {row.label}
          </span>
        </div>
      ))}
    </nav>
  );
}
