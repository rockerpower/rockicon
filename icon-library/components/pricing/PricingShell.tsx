'use client';
import { useState, useEffect, useCallback } from 'react';
import { signIn } from 'next-auth/react';

// Prices are display-only until Stripe is wired (STRIPE_PRICE_ID). Checkout
// reuses /api/checkout (mock grant in dev, Stripe redirect in prod).
const PRICING = { proMonthly: 9, proYearly: 72 };

const FREE_FEATURES = [
  'All Free icons, unlimited use',
  'MIT license — commercial OK',
  'SVG, JSX, PNG export',
  'Live size / stroke / color',
];
const PRO_FEATURES = [
  'Everything in Free, plus:',
  'All Pro icons + every style',
  'New icons as they ship',
  'Priority support',
];

export function PricingShell() {
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
    <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px 80px' }}>
      {/* Top bar */}
      <div style={{ width: '100%', maxWidth: 880, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <a href="/" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>← Back to icons</a>
        {session && <span style={{ fontSize: 12.5, color: 'var(--muted-2)' }}>{session.email}</span>}
      </div>

      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600, letterSpacing: '-.02em' }}>Simple pricing</h1>
      <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--muted)' }}>Start free. Upgrade when you need the Pro set.</p>

      {/* Billing toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 24, padding: 4, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        {([['Monthly', false], ['Yearly', true]] as const).map(([label, y]) => (
          <button key={label} onClick={() => setYearly(y)} style={{ height: 30, padding: '0 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer', background: yearly === y ? 'var(--foreground)' : 'transparent', color: yearly === y ? 'var(--background)' : 'var(--muted)' }}>
            {label}{label === 'Yearly' && <span style={{ fontSize: 10, marginLeft: 4, opacity: .7 }}>save 33%</span>}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 300px))', gap: 20, marginTop: 32, width: '100%', maxWidth: 640, justifyContent: 'center' }}>
        {/* Free */}
        <div style={{ padding: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted-2)' }}>Free</div>
          <div style={{ margin: '12px 0 4px', fontSize: 40, fontWeight: 700, letterSpacing: '-.02em' }}>$0</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 20 }}>forever</div>
          <Features items={FREE_FEATURES} />
          <a href="/" style={{ display: 'flex', height: 42, alignItems: 'center', justifyContent: 'center', marginTop: 20, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--foreground)', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>Browse free icons</a>
        </div>

        {/* Pro */}
        <div style={{ padding: 24, background: 'var(--surface)', border: '1px solid var(--pro, #7C6AE8)', borderRadius: 16, position: 'relative' }}>
          <span style={{ position: 'absolute', top: -11, left: 24, height: 22, display: 'inline-flex', alignItems: 'center', padding: '0 10px', borderRadius: 6, background: 'var(--pro, #7C6AE8)', color: '#fff', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em' }}>POPULAR</span>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--pro, #7C6AE8)' }}>Pro</div>
          <div style={{ margin: '12px 0 4px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.02em' }}>${price}</span>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>{per}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 20 }}>{yearly ? `$${(PRICING.proYearly / 12).toFixed(0)}/mo billed yearly` : 'billed monthly'}</div>
          <Features items={PRO_FEATURES} accent />
          <button onClick={goPro} disabled={busy || entitled} style={{ width: '100%', height: 42, marginTop: 20, borderRadius: 10, border: 'none', background: entitled ? 'var(--surface-2)' : 'var(--pro, #7C6AE8)', color: entitled ? 'var(--muted)' : '#fff', fontSize: 13.5, fontWeight: 700, cursor: entitled ? 'default' : 'pointer', opacity: busy ? .6 : 1 }}>
            {entitled ? '✓ You are Pro' : busy ? 'Processing…' : session ? 'Upgrade to Pro' : 'Sign in to upgrade'}
          </button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 20, fontSize: 13, color: 'var(--muted)' }}>{msg}</div>}
      <p style={{ marginTop: 28, fontSize: 11.5, color: 'var(--muted-2)' }}>Prices in USD. Cancel anytime.</p>
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
