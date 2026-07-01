'use client';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo } from 'react';
import type { IconMeta } from '@/types';
import { SvgIcon } from '@/components/icons/SvgIcon';

interface Props {
  icons: IconMeta[];
  bundleId: string;
  density: 24 | 28 | 32;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const BOX_SIZE = { 24: 78, 28: 92, 32: 106 } as const;

export function IconGrid({ icons, bundleId, density, selectedId, onSelect }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const box = BOX_SIZE[density];

  // compute columns reactively based on container width (approximate; re-layout on resize via CSS)
  const COLS = Math.max(1, Math.floor((parentRef.current?.clientWidth ?? 900) / box));
  const rows = useMemo(() => {
    const r: IconMeta[][] = [];
    for (let i = 0; i < icons.length; i += COLS) r.push(icons.slice(i, i + COLS));
    return r;
  }, [icons, COLS]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => box + 6,
    overscan: 4,
  });

  return (
    <div
      ref={parentRef}
      style={{ flex: 1, overflowY: 'auto', position: 'relative' }}
    >
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map(vRow => (
          <div
            key={vRow.index}
            style={{
              position: 'absolute',
              top: vRow.start,
              left: 0,
              right: 0,
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${box}px, 1fr))`,
              gap: 6,
              padding: '0 4px',
            }}
          >
            {rows[vRow.index]?.map(ic => {
              const variant = ic.variants.find(v => v.bundleId === bundleId) ?? ic.variants[0];
              if (!variant) return null;
              const active = ic.id === selectedId;
              return (
                <button
                  key={ic.id}
                  onClick={() => onSelect(ic.id)}
                  title={ic.name}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '14px 8px', minHeight: box,
                    borderRadius: 12, cursor: 'pointer', border: `1px solid ${active ? 'var(--border-2)' : 'transparent'}`,
                    background: active ? 'var(--surface-2)' : 'transparent',
                    color: 'var(--foreground)',
                    transition: 'background .1s, border-color .1s',
                  }}
                  className="hover:bg-[var(--surface-2)]"
                >
                  <SvgIcon variant={variant} size={density} strokeWidth={2} />
                  <span style={{
                    marginTop: 8, fontSize: 9, fontFamily: 'monospace',
                    color: 'var(--muted-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center',
                  }}>
                    {ic.name}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
