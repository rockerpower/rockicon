import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Pro delivery reads icons-source/ at runtime; force it into the serverless
  // function bundle so it exists on Vercel (files outside the traced graph are
  // otherwise dropped).
  outputFileTracingIncludes: {
    '/api/pro/[slug]': ['./icons-source/**/*'],
    '/api/pro/[slug]/[name]': ['./icons-source/**/*'],
  },
};

export default nextConfig;
