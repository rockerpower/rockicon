'use client';
import { useState, useEffect } from 'react';
import { PricingCards } from '@/components/pricing/PricingCards';

export function PricingShell() {
  const [session, setSession] = useState<{ email: string; tier: 'free' | 'pro' } | null>(null);

  useEffect(() => {
    fetch('/api/session').then(r => r.json()).then(d => setSession(d.session)).catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px 80px' }}>
      {/* Top bar */}
      <div style={{ width: '100%', maxWidth: 880, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <a href="/" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>← Back to icons</a>
        {session && <span style={{ fontSize: 12.5, color: 'var(--muted-2)' }}>{session.email}</span>}
      </div>

      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600, letterSpacing: '-.02em' }}>Simple pricing</h1>
      <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--muted)' }}>Start free. Upgrade when you need the Pro set.</p>

      <div style={{ marginTop: 24, width: '100%', maxWidth: 640 }}>
        <PricingCards />
      </div>
    </div>
  );
}
