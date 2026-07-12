'use client';
import { useState, useCallback, useEffect } from 'react';
import type { IconMeta, IconVariant } from '@/types';
import { SvgIcon } from '@/components/icons/SvgIcon';
import { buildSvgMarkup, copyText, downloadPng, downloadText } from '@/lib/svg-render';
import { canAccessFormat, FORMAT_LABELS, FREE_ATTRIBUTION, FREE_FIXED_SIZE, FREE_FIXED_STROKE, FREE_COLORS, type ExportFormat, type Tier } from '@/lib/licensing';

interface Props {
  icon: IconMeta;
  familySlug: string;
  activeBundleId: string;
  signedIn: boolean;
  userTier: Tier;
  unlockedVariants: IconVariant[] | null;   // delivered by parent when entitled
  onRequestLogin: () => void;
  onUnlocked: () => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

const COLOR_RAMP = ['#FFFFFF', '#C9C9C4', '#8A8A86', '#4A4A48', '#17171A', '#000000'];

export function DetailPanel({ icon, familySlug, activeBundleId, signedIn, userTier, unlockedVariants, onRequestLogin, onUnlocked, onClose, onToast }: Props) {
  const isFreeTier = userTier === 'free';
  const [size, setSize] = useState(isFreeTier ? FREE_FIXED_SIZE : 48);
  const [strokeWidth, setStrokeWidth] = useState(isFreeTier ? FREE_FIXED_STROKE : 2);
  const [color, setColor] = useState(isFreeTier ? FREE_COLORS[0] : '#FFFFFF');
  const [menu, setMenu] = useState<'copy' | 'download' | null>(null);
  const goPricing = () => { window.location.assign('/pricing'); };

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
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted-2)', marginTop: 4 }}>
            {icon.categoryId}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ flexShrink: 0, height: 40, width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '0.5px solid #C7C7C7', borderRadius: 'var(--radius)', color: 'var(--muted)', cursor: 'pointer', marginLeft: 10 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ opacity: .7 }}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 24px' }}>
        {locked ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 12 }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192, width: '100%', border: '1px solid var(--border)', background: 'var(--surface)', marginBottom: 18, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)', backgroundSize: '22px 22px', opacity: .5, pointerEvents: 'none' }} />
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--pro, #7C6AE8)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px', borderRadius: 'var(--radius)', background: 'var(--pro, #7C6AE8)', color: '#fff', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>Pro icon</span>
            <p style={{ margin: '0 0 18px', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              This icon is part of the Pro set. Unlock the full vector, all styles, and every export format with a Pro plan.
            </p>
            <button
              onClick={unlockPro}
              disabled={unlocking}
              style={{ width: '100%', height: 42, background: 'var(--pro, #7C6AE8)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', marginBottom: 18, opacity: unlocking ? .6 : 1 }}
            >
              {unlocking ? 'Unlocking…' : signedIn ? 'Unlock Pro — $9/mo' : 'Sign in to unlock'}
            </button>
            {icon.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
                {icon.tags.map(t => (
                  <span key={t} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '7px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{t}</span>
                ))}
              </div>
            )}
          </div>
        ) : (<>
        {/* Preview */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 250, border: '1px solid var(--border)', background: 'var(--surface)', marginBottom: 18, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(128,128,128,.11) 0 1px,transparent 1px 24px),repeating-linear-gradient(90deg,rgba(128,128,128,.11) 0 1px,transparent 1px 24px)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', color }}>
            <SvgIcon variant={variant} size={Math.min(size, 140)} strokeWidth={strokeWidth} color={color} />
          </div>
          <span style={{ position: 'absolute', left: 20, bottom: 16, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted-2)' }}>{size}×{size}px</span>
        </div>

        {/* Bundle switcher (only bundles this icon exists in) */}
        {availBundles.length > 1 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 8 }}>Style</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {availBundles.map(bid => (
                <button
                  key={bid}
                  onClick={() => setBundleId(bid)}
                  style={{
                    flex: 1, height: 34, background: bid === bundleId ? 'var(--foreground)' : 'transparent',
                    color: bid === bundleId ? 'var(--background)' : 'var(--muted)',
                    border: `0.5px solid ${bid === bundleId ? 'transparent' : '#C7C7C7'}`,
                    borderRadius: 'var(--radius)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
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
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)' }}>Size</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                {size}px {isFreeTier && <ProLock />}
              </span>
            </div>
            <input type="range" min={16} max={96} value={size} onChange={e => setSize(+e.target.value)} disabled={isFreeTier} style={{ width: '100%', accentColor: 'var(--accent)', opacity: isFreeTier ? .35 : 1 }} />
            {isFreeTier && <UpgradeHint onClick={goPricing} text="Free tier is fixed at 24px — upgrade for live sizing" />}
          </div>

          {/* Stroke width */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)' }}>Stroke width</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                {strokeBased ? strokeWidth : 'n/a'} {isFreeTier && strokeBased && <ProLock />}
              </span>
            </div>
            <input type="range" min={0.5} max={3} step={0.25} value={strokeWidth} onChange={e => setStrokeWidth(+e.target.value)} disabled={!strokeBased || isFreeTier} style={{ width: '100%', accentColor: 'var(--accent)', opacity: strokeBased && !isFreeTier ? 1 : .35 }} />
            {isFreeTier && strokeBased && <UpgradeHint onClick={goPricing} text="Free tier is fixed at 2px — upgrade for live stroke control" />}
          </div>

          {/* Color */}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              Color {isFreeTier && <ProLock />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {COLOR_RAMP.map(hex => {
                  const allowed = !isFreeTier || FREE_COLORS.includes(hex);
                  return (
                    <button
                      key={hex}
                      onClick={() => allowed ? setColor(hex) : goPricing()}
                      title={allowed ? hex : `${hex} — Pro only`}
                      style={{ height: 32, width: 32, borderRadius: 'var(--radius)', background: hex, boxShadow: 'inset 0 0 0 1px var(--border)', border: `2px solid ${color.toUpperCase() === hex ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer', padding: 0, opacity: allowed ? 1 : .3 }}
                    />
                  );
                })}
              </div>
              <input
                value={color}
                onChange={e => setColor(e.target.value)}
                disabled={isFreeTier}
                style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-2)', color: 'var(--foreground)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', opacity: isFreeTier ? .5 : 1 }}
              />
            </div>
            {isFreeTier && <UpgradeHint onClick={goPricing} text="Free tier: black or white only — upgrade for any color" />}
          </div>
        </div>

        {/* Actions: Copy + Download, format-gated */}
        {(() => {
          const iconKey = icon.id.split('__').pop() ?? icon.name.replace(/\s+/g, '-');

          const doExport = async (format: ExportFormat, action: 'copy' | 'download') => {
            setMenu(null);
            // Free SVG copy is instant, client-side.
            if (action === 'copy' && format === 'svg') { copy(markup, 'Copied SVG'); return; }
            // Everything else routes through the server (gating + rate limit + attribution).
            try {
              const params = new URLSearchParams({ bundle: variant.bundleId, format, size: String(size), color, strokeWidth: String(strokeWidth) });
              const res = await fetch(`/api/export/${familySlug}/${iconKey}?${params}`);
              const data = await res.json().catch(() => ({}));
              if (res.status === 402 || res.status === 429) { onToast(data.error ?? 'Upgrade required'); goPricing(); return; }
              if (!res.ok) { onToast(data.error ?? 'Export failed'); return; }
              if (action === 'copy') { copyText(data.content); onToast(`Copied ${FORMAT_LABELS[format]}`); }
              else if (format === 'png') { downloadPng(data.content, icon.name); onToast('Downloaded PNG'); }
              else { downloadText(data.content, data.filename); onToast(`Downloaded ${data.filename}`); }
            } catch { onToast('Export failed'); }
          };

          const action = menu === 'copy' ? 'copy' as const : 'download' as const;
          const formats: ExportFormat[] = menu === 'download' ? ['svg', 'png', 'jsx', 'vue'] : ['svg', 'jsx', 'vue'];
          return (
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <button onClick={() => setMenu(m => m === 'copy' ? null : 'copy')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--foreground)', color: 'var(--background)', border: 'none', padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', borderRadius: 'var(--radius)' }}>
                  Copy <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {menu === 'copy' && (
                  <>
                    <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 41, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 5, boxShadow: '0 14px 34px -14px rgba(0,0,0,.3)' }}>
                      {formats.map(fmt => {
                        const locked = !canAccessFormat(userTier, fmt);
                        return (
                          <button key={fmt} onClick={() => locked ? goPricing() : doExport(fmt, action)}
                            title={locked ? 'Upgrade to Pro' : undefined}
                            style={{ width: '100%', textAlign: 'left', height: 34, padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', borderRadius: 'var(--radius)', color: locked ? 'var(--muted-2)' : 'var(--foreground)', fontSize: 13, cursor: 'pointer' }}
                            className="hover:bg-[var(--surface-2)]">
                            <span>{FORMAT_LABELS[fmt]}</span>
                            {locked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--pro, #7C6AE8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <button onClick={() => setMenu(m => m === 'download' ? null : 'download')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent', color: 'var(--foreground)', padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: '0.5px solid #C7C7C7', borderRadius: 'var(--radius)' }}>
                  Download <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {menu === 'download' && (
                  <>
                    <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 41, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 5, boxShadow: '0 14px 34px -14px rgba(0,0,0,.3)' }}>
                      {formats.map(fmt => {
                        const locked = !canAccessFormat(userTier, fmt);
                        return (
                          <button key={fmt} onClick={() => locked ? goPricing() : doExport(fmt, action)}
                            title={locked ? 'Upgrade to Pro' : undefined}
                            style={{ width: '100%', textAlign: 'left', height: 34, padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', borderRadius: 'var(--radius)', color: locked ? 'var(--muted-2)' : 'var(--foreground)', fontSize: 13, cursor: 'pointer' }}
                            className="hover:bg-[var(--surface-2)]">
                            <span>{FORMAT_LABELS[fmt]}</span>
                            {locked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--pro, #7C6AE8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* License note (Free tier) */}
        {userTier === 'free' && (
          <div style={{ fontSize: 10.5, color: 'var(--muted-2)', lineHeight: 1.5, marginBottom: 20 }}>
            {FREE_ATTRIBUTION.replace(' — see /license.', '.')} <a href="/license" style={{ color: 'var(--muted)', textDecoration: 'underline' }}>License</a>
          </div>
        )}

        {/* Tags */}
        {icon.tags.length > 0 && (
          <>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 8 }}>Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 18 }}>
              {icon.tags.map(t => (
                <span key={t} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '7px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{t}</span>
              ))}
            </div>
          </>
        )}

        {/* Markup — Pro only */}
        {isFreeTier ? (
          <button onClick={goPricing} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--muted-2)', fontSize: 11.5, cursor: 'pointer' }}>
            Markup — Pro feature <ProLock />
          </button>
        ) : (<>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 8 }}>Markup</div>
          <div onClick={() => copy(markup, 'Copied SVG')} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.7, color: 'var(--accent)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', cursor: 'copy' }}>
            {markup}
          </div>
        </>)}
        </>)}
      </div>
    </aside>
  );
}

function ProLock() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--pro, #7C6AE8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
  );
}

function UpgradeHint({ onClick, text }: { onClick: () => void; text: string }) {
  return (
    <button onClick={onClick} style={{ marginTop: 6, background: 'transparent', border: 'none', padding: 0, color: 'var(--muted-2)', fontSize: 10.5, textAlign: 'left', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
      {text}
    </button>
  );
}
