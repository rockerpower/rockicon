import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'License · Icon Library',
  description: 'How you can use Rockicon Free and Pro icons.',
};

const CARD: React.CSSProperties = { padding: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16 };
const H: React.CSSProperties = { fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted-2)', marginBottom: 12 };
const ROW: React.CSSProperties = { display: 'flex', gap: 10, fontSize: 13.5, color: 'var(--foreground)', marginBottom: 10, lineHeight: 1.5 };

function Check() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><polyline points="20 6 9 17 4 12" /></svg>;
}

export default function LicensePage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px 80px' }}>
      <div style={{ width: '100%', maxWidth: 720 }}>
        <a href="/" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>← Back to icons</a>

        <h1 style={{ margin: '20px 0 8px', fontSize: 32, fontWeight: 600, letterSpacing: '-.02em' }}>License</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>Plain-language terms. No lawyer required.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 28 }}>
          {/* Free */}
          <div style={CARD}>
            <div style={H}>Free tier</div>
            <div style={ROW}><Check />Use for personal <strong>and</strong> commercial projects.</div>
            <div style={ROW}><Check /><span><strong>Attribution required for commercial use</strong> — credit &ldquo;Rockicon&rdquo; with a link. Personal use needs no attribution.</span></div>
            <div style={ROW}><Check />Download as SVG and PNG.</div>
            <div style={ROW}><Check />Modify colors, size, and stroke freely.</div>
            <div style={{ ...ROW, color: 'var(--muted-2)' }}><span style={{ width: 16, flexShrink: 0 }}>✕</span>No React / Vue components or the full Pro icon set.</div>
          </div>

          {/* Pro */}
          <div style={{ ...CARD, borderColor: 'var(--pro, #7C6AE8)' }}>
            <div style={{ ...H, color: 'var(--pro, #7C6AE8)' }}>Pro tier</div>
            <div style={ROW}><Check /><strong>Full commercial license — no attribution required.</strong></div>
            <div style={ROW}><Check />Every icon in the library, all styles.</div>
            <div style={ROW}><Check />All formats: SVG, PNG, React (JSX), Vue.</div>
            <div style={ROW}><Check />Unlimited downloads (Free is capped daily).</div>
            <div style={ROW}><Check />Use in unlimited projects and client work.</div>
          </div>
        </div>

        {/* Prose */}
        <div style={{ marginTop: 32, fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.7 }}>
          <h2 style={{ fontSize: 15, color: 'var(--foreground)', margin: '0 0 8px' }}>The short version</h2>
          <p style={{ margin: '0 0 14px' }}>You can build with these icons — for yourself, your job, or your clients. On the <strong>Free</strong> tier, if the project is commercial, add a small credit to &ldquo;Rockicon&rdquo; (a link in your footer, about page, or credits is fine). On <strong>Pro</strong>, that requirement goes away and you get every icon and export format.</p>
          <h2 style={{ fontSize: 15, color: 'var(--foreground)', margin: '0 0 8px' }}>What&rsquo;s not allowed</h2>
          <p style={{ margin: '0 0 14px' }}>Don&rsquo;t resell or redistribute the icons as your own icon pack, and don&rsquo;t sublicense them. In other words: use them in your products, don&rsquo;t sell them <em>as</em> the product.</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)' }}>Questions? See <a href="/pricing" style={{ color: 'var(--muted)', textDecoration: 'underline' }}>pricing</a> or reach out.</p>
        </div>
      </div>
    </div>
  );
}
