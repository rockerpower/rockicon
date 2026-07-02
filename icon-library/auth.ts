import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

// Auth.js v5 — GitHub OAuth for verified identity. Session is a JWT (no DB
// adapter): we only need the user's verified email, and Pro entitlement is
// tracked separately in the entitlements store (keyed by that email).
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: 'jwt' },
  trustHost: true, // required behind Vercel's proxy
});
