'use client';
import { useState, useCallback, useEffect } from 'react';
import type { IconMeta, IconVariant } from '@/types';
import { SvgIcon } from '@/components/icons/SvgIcon';
import { buildSvgMarkup, copyText, downloadSvg, downloadPng, toJsx } from '@/lib/svg-render';

interface Props {
  icon: IconMeta;
  familySlug: string;
  activeBundleId: string;
  signedIn: boolean;
  unlockedVariants: IconVariant[] | null;   // delivered by parent when entitled
  onRequestLogin: () => void;
  onUnlocked: () => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

const COLOR_RAMP = ['#FFFFFF', '#C9C9C4', '#8A8A86', '#4A4A48', '#17171A', '#000000'];

export function DetailPanel({ icon, familySlug, activeBundleId, signedIn, unlockedVariants, onRequestLogin, onUnlocked, onClose, onToast }: Props) {
  const [size, setSize] = useState(48);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [color, setColor] = useState('#FFFFFF');

  const isPro = icon.tier === 'pro';
  // Parent delivers Pro vectors when entitled; keep a local copy so an unlock
  // that happens in this panel takes effect immediately.
  const [localUnlocked, setLocalUnlocked] = useState<IconVariant[] | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const unlocked = unlockedVariants ?? localUnlocked;

  useEffect(() => { setLocalUnlocked(null); }, [icon.id]);

  const unlockPro = useCallback(async () => {
    if (!signedIn) { onRequestLogin(); return; }
    setUnlocking(true);
    try {
      const res = await fetch('/api/checkout', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.mode === 'stripe' && data.url) {
        window.location.href = data.url; // redirect to Stripe Checkout
        return;
      }
      if (res.ok && data.entitled) {
        // Mock grant: fetch this icon's vector now, then let parent refresh grid.
        const vres = await fetch(`/api/pro/${familySlug}/${icon.name}`);
        if (vres.ok) { const vd = await vres.json(); setLocalUnlocked(vd.icon.variants as IconVariant[]); }
        onUnlocked();
        onToast('Pro unlocked');
      } else if (res.status === 401) {
        onRequestLogin();
      } else {
        onToast(data.error ?? 'Checkout failed');
      }
    } catch { onToast('Checkout failed'); }
    setUnlocking(false);
  }, [signedIn, onRequestLogin, familySlug, icon.name, onUnlocked, onToast]);

  const variants = unlocked ?? icon.variants;
  const availBundles = variants.map(v => v.bundleId);
  const [bundleId, setBundleId] = useState(
    availBundles.includes(activeBundleId) ? activeBundleId : availBundles[0]
  );

  const variant = variants.find(v => v.bundleId === bundleId) ?? variants[0];
  const strokeBased = variant?.strokeBased ?? true;
  const locked = isPro && !unlocked;

  const markup = variant
    ? buildSvgMarkup(variant, { size, color, strokeWidth })
    : '';

  const copy = useCallback((text: string, label: string) => {
    copyText(text);
    onToast(label);
  }, [onToast]);

  if (!variant) return null;

  return (
    <aside
      className="panel-in"
      style={{
        flex: '0 0 320px', borderLeft: '1px solid var(--border)',
        background: 'var(--background)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 20px 14px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-.01em', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {icon.name}
          </div>
          <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted-2)', marginTop: 4 }}>
            {icon.categoryId}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ flexShrink: 0, height: 32, width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', marginLeft: 10 }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 24px' }}>
        {locked ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 12 }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192, width: '100%', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--field)', marginBottom: 18, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)', backgroundSize: '22px 22px', opacity: .5, pointerEvents: 'none' }} />
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--pro, #7C6AE8)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px', borderRadius: 6, background: 'var(--pro, #7C6AE8)', color: '#fff', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>Pro icon</span>
            <p style={{ margin: '0 0 18px', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              This icon is part of the Pro set. Unlock the full vector, all styles, and every export format with a Pro plan.
            </p>
            <button
              onClick={unlockPro}
              disabled={unlocking}
              style={{ width: '100%', height: 42, background: 'var(--pro, #7C6AE8)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', marginBottom: 18, opacity: unlocking ? .6 : 1 }}
            >
              {unlocking ? 'Unlocking…' : signedIn ? 'Unlock Pro — $9/mo' : 'Sign in to unlock'}
            </button>
            {icon.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
                {icon.tags.map(t => (
                  <span key={t} style={{ height: 24, display: 'inline-flex', alignItems: 'center', padding: '0 9px', background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'monospace', fontSize: 10.5, color: 'var(--muted)' }}>{t}</span>
                ))}
              </div>
            )}
          </div>
        ) : (<>
        {/* Preview */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--field)', marginBottom: 18, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)', backgroundSize: '22px 22px', opacity: .5, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', color }}>
            <SvgIcon variant={variant} size={Math.min(size, 140)} strokeWidth={strokeWidth} color={color} />
          </div>
          <span style={{ position: 'absolute', left: 10, bottom: 8, fontFamily: 'monospace', fontSize: 9, color: 'var(--muted-2)' }}>{size}×{size}px</span>
        </div>

        {/* Bundle switcher (only bundles this icon exists in) */}
        {availBundles.length > 1 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 8 }}>Style</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {availBundles.map(bid => (
                <button
                  key={bid}
                  onClick={() => setBundleId(bid)}
                  style={{
                    flex: 1, height: 34, background: bid === bundleId ? 'var(--foreground)' : 'transparent',
                    color: bid === bundleId ? 'var(--background)' : 'var(--muted)',
                    border: `1px solid ${bid === bundleId ? 'transparent' : 'var(--border)'}`,
                    borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                  }}
                >
                  {bid}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          {/* Size */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)' }}>Size</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{size}px</span>
            </div>
            <input type="range" min={16} max={96} value={size} onChange={e => setSize(+e.target.value)} style={{ width: '100%', accentColor: 'var(--foreground)' }} />
          </div>

          {/* Stroke width */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)' }}>Stroke width</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{strokeBased ? strokeWidth : 'n/a'}</span>
            </div>
            <input type="range" min={0.5} max={3} step={0.25} value={strokeWidth} onChange={e => setStrokeWidth(+e.target.value)} disabled={!strokeBased} style={{ width: '100%', accentColor: 'var(--foreground)', opacity: strokeBased ? 1 : .35 }} />
          </div>

          {/* Color */}
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 8 }}>Color</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {COLOR_RAMP.map(hex => (
                  <button
                    key={hex}
                    onClick={() => setColor(hex)}
                    title={hex}
                    style={{ height: 24, width: 24, borderRadius: 6, background: hex, border: `1px solid ${color.toUpperCase() === hex ? 'var(--foreground)' : 'var(--border-2)'}`, boxShadow: color.toUpperCase() === hex ? '0 0 0 2px var(--background), 0 0 0 3px var(--foreground)' : 'none', cursor: 'pointer', padding: 0 }}
                  />
                ))}
              </div>
              <input
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--field)', color: 'var(--foreground)', fontFamily: 'monospace', fontSize: 12, outline: 'none' }}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => copy(markup, 'Copied SVG')}
            style={{ flex: 1, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'var(--foreground)', color: 'var(--background)', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
          >
            Copy SVG
          </button>
          <button
            onClick={() => downloadSvg(markup, icon.name)}
            style={{ flexShrink: 0, height: 40, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border-2)', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
          >
            .svg
          </button>
          <button
            onClick={() => { downloadPng(markup, icon.name); onToast('Downloaded PNG'); }}
            style={{ flexShrink: 0, height: 40, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border-2)', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
          >
            .png
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 22 }}>
          {[
            { label: 'JSX', fn: () => copy(toJsx(markup, icon.name), 'Copied JSX') },
            { label: 'Data URI', fn: () => copy('data:image/svg+xml,' + encodeURIComponent(markup), 'Copied data URI') },
            { label: 'Base64', fn: () => copy('data:image/svg+xml;base64,' + btoa(markup), 'Copied Base64') },
            { label: 'Raw SVG', fn: () => copy(markup, 'Copied raw SVG') },
          ].map(a => (
            <button
              key={a.label}
              onClick={a.fn}
              style={{ height: 36, background: 'var(--surface-2)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'monospace' }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Tags */}
        {icon.tags.length > 0 && (
          <>
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 8 }}>Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 18 }}>
              {icon.tags.map(t => (
                <span key={t} style={{ height: 24, display: 'inline-flex', alignItems: 'center', padding: '0 9px', background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'monospace', fontSize: 10.5, color: 'var(--muted)' }}>{t}</span>
              ))}
            </div>
          </>
        )}

        {/* Markup */}
        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 8 }}>Markup</div>
        <pre style={{ margin: 0, padding: '12px 14px', background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 10, fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.6, color: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {markup}
        </pre>
        </>)}
      </div>
    </aside>
  );
}
