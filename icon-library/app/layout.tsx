import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Icon Library',
  description: 'Browse and export icons',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100%' }} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body style={{ height: '100%', margin: 0, overflow: 'hidden' }}>
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
