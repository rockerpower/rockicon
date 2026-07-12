'use client';
import { useState, useEffect, useCallback } from 'react';
import { signIn } from 'next-auth/react';

// Prices are display-only until Stripe is wired (STRIPE_PRICE_ID). Checkout
// reuses /api/checkout (mock grant in dev, Stripe redirect in prod).
const PRICING = { proMonthly: 9, proYearly: 72 };

const FREE_FEATURES = [
  'All Free icons, unlimited use',
  'MIT license — commercial OK',
  'Copy & download SVG, PNG',
  'Fixed 24px, 2px stroke, black/white',
];
const PRO_FEATURES = [
  'Everything in Free, plus:',
  'Live size / stroke / any color',
  'Markup view + JSX, Vue export',
  'All Pro icons + every style',
  'New icons as they ship',
  'Priority support',
];

export function PricingCards() {
  const [yearly, setYearly] = useState(false);
  const [session, setSession] = useState<{ email: string; tier: 'free' | 'pro' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/session').then(r => r.json()).then(d => setSession(d.session)).catch(() => {});
  }, []);

  const goPro = useCallback(async () => {
    if (!session) { signIn('github', { callbackUrl: window.location.href }); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.mode === 'stripe' && data.url) { window.location.href = data.url; return; }
      if (res.ok && data.entitled) { setSession(s => s && { ...s, tier: 'pro' }); setMsg('You are Pro now 🎉'); }
      else setMsg(data.error ?? 'Checkout failed');
    } catch { setMsg('Checkout failed'); }
    setBusy(false);
  }, [session]);

  const entitled = session?.tier === 'pro';
  const price = yearly ? PRICING.proYearly : PRICING.proMonthly;
  const per = yearly ? '/yr' : '/mo';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Billing toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, background: 'var(--surface-2)', border: '0.5px solid #C7C7C7', borderRadius: 'var(--radius)' }}>
        {([['Monthly', false], ['Yearly', true]] as const).map(([label, y]) => (
          <button key={label} onClick={() => setYearly(y)} style={{ height: 30, padding: '0 14px', borderRadius: 'var(--radius)', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer', background: yearly === y ? 'var(--foreground)' : 'transparent', color: yearly === y ? 'var(--background)' : 'var(--muted)' }}>
            {label}{label === 'Yearly' && <span style={{ fontSize: 10, marginLeft: 4, opacity: .7 }}>save 33%</span>}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 24, width: '100%' }}>
        {/* Free */}
        <div style={{ padding: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted-2)' }}>Free</div>
          <div style={{ margin: '12px 0 4px', fontSize: 36, fontWeight: 700, letterSpacing: '-.02em' }}>$0</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 18 }}>forever</div>
          <Features items={FREE_FEATURES} />
          <a href="/" style={{ display: 'flex', height: 42, alignItems: 'center', justifyContent: 'center', marginTop: 18, borderRadius: 'var(--radius)', background: 'var(--surface-2)', border: '0.5px solid #C7C7C7', color: 'var(--foreground)', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>Browse free icons</a>
        </div>

        {/* Pro */}
        <div style={{ padding: 24, background: 'var(--accent-soft)', border: '1.5px solid var(--pro, #7C6AE8)', borderRadius: 'var(--radius)', position: 'relative' }}>
          <span style={{ position: 'absolute', top: -11, left: 22, height: 22, display: 'inline-flex', alignItems: 'center', padding: '0 10px', borderRadius: 'var(--radius)', background: 'var(--pro, #7C6AE8)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Popular</span>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--pro, #7C6AE8)' }}>Pro</div>
          <div style={{ margin: '12px 0 4px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-.02em' }}>${price}</span>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>{per}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 18 }}>{yearly ? `$${(PRICING.proYearly / 12).toFixed(0)}/mo billed yearly` : 'billed monthly'}</div>
          <Features items={PRO_FEATURES} accent />
          <button onClick={goPro} disabled={busy || entitled} style={{ width: '100%', height: 42, marginTop: 18, borderRadius: 'var(--radius)', border: 'none', background: entitled ? 'var(--surface-2)' : 'var(--pro, #7C6AE8)', color: entitled ? 'var(--muted)' : '#fff', fontSize: 13.5, fontWeight: 700, cursor: entitled ? 'default' : 'pointer', opacity: busy ? .6 : 1 }}>
            {entitled ? '✓ You are Pro' : busy ? 'Processing…' : session ? 'Upgrade to Pro' : 'Sign in to upgrade'}
          </button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 18, fontSize: 13, color: 'var(--muted)' }}>{msg}</div>}
      <p style={{ marginTop: 22, fontSize: 11.5, color: 'var(--muted-2)', textAlign: 'center' }}>Prices in USD. Cancel anytime. See the <a href="/license" style={{ color: 'var(--muted)', textDecoration: 'underline' }}>license</a>.</p>
    </div>
  );
}

function Features({ items, accent }: { items: string[]; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: i === 0 && accent ? 'var(--muted-2)' : 'var(--foreground)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={accent ? 'var(--pro, #7C6AE8)' : 'var(--muted)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
          {f}
        </div>
      ))}
    </div>
  );
}
