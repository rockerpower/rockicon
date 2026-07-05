// Licensing / format-access model.
// Two gating axes:
//   1. Icon tier   — a Pro icon is fully locked to Free users (vectors also
//      never ship to the client; see build-icons.ts + /api/pro).
//   2. Format tier — even for a Free icon, advanced formats need Pro.
// Free users additionally get a daily download cap.

export type ExportFormat = 'svg' | 'png' | 'jsx' | 'vue';
export type Tier = 'free' | 'pro';

// Which plan each export format needs.
export const FORMAT_ACCESS: Record<ExportFormat, Tier> = {
  svg: 'free',
  png: 'free',
  jsx: 'pro',   // React component
  vue: 'pro',   // Vue component
};

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  svg: 'SVG',
  png: 'PNG',
  jsx: 'React (JSX)',
  vue: 'Vue',
};

// Free tier daily download cap (Pro = unlimited).
export const FREE_DAILY_LIMIT = 5;

export function isFreeFormat(format: ExportFormat): boolean {
  return FORMAT_ACCESS[format] === 'free';
}

export function canAccessFormat(userTier: Tier, format: ExportFormat): boolean {
  return FORMAT_ACCESS[format] === 'free' || userTier === 'pro';
}

export function canAccessIcon(userTier: Tier, iconTier: Tier): boolean {
  return iconTier === 'free' || userTier === 'pro';
}

// Full check: can this user export this icon in this format?
export function canExport(userTier: Tier, iconTier: Tier, format: ExportFormat): boolean {
  return canAccessIcon(userTier, iconTier) && canAccessFormat(userTier, format);
}

// Attribution notice attached to Free-tier downloads (commercial use).
export const FREE_ATTRIBUTION =
  'Free tier: attribution required for commercial use. Upgrade to Pro for an attribution-free commercial license — see /license.';
