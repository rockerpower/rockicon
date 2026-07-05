import type { PathNode, IconVariant } from '@/types';

function attrsToString(attrs: Record<string, string | number>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

export function pathsToSvgInner(paths: PathNode[]): string {
  return paths.map(p => `<${p.tag} ${attrsToString(p.attrs)}/>`).join('');
}

export function buildSvgMarkup(
  variant: IconVariant,
  opts: { size: number; color: string; strokeWidth: number }
): string {
  const { size, color, strokeWidth } = opts;
  const inner = pathsToSvgInner(variant.paths);

  if (variant.strokeBased) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${variant.viewBox}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${variant.viewBox}" fill="${color}">${inner}</svg>`;
}

export function copyText(text: string) {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

export function downloadSvg(markup: string, name: string) {
  const blob = new Blob([markup], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/\s+/g, '-') + '.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Rasterize SVG markup to a PNG and trigger a download.
// scale multiplies the SVG's intrinsic size for higher-res output.
export function downloadPng(markup: string, name: string, scale = 4) {
  const sizeMatch = markup.match(/width="(\d+(?:\.\d+)?)"/);
  const base = sizeMatch ? parseFloat(sizeMatch[1]) : 48;
  const px = Math.round(base * scale);

  const svgBlob = new Blob([markup], { type: 'image/svg+xml' });
  const svgUrl = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(svgUrl); return; }
    ctx.drawImage(img, 0, 0, px, px);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name.replace(/\s+/g, '-') + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(svgUrl);
  img.src = svgUrl;
}

// Trigger a text-file download (svg/jsx/vue).
export function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function toPascalCase(name: string): string {
  return name.replace(/[^a-z0-9 ]/gi, '').split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

export function toVue(markup: string, name: string): string {
  const inner = markup
    .replace(/xmlns="[^"]*"\s*/g, '')
    .replace(/^<svg/, '<svg v-bind="$attrs"');
  return `<!-- ${toPascalCase(name)}Icon.vue -->\n<template>\n  ${inner}\n</template>\n\n<script setup lang="ts">\ndefineOptions({ name: '${toPascalCase(name)}Icon', inheritAttrs: false });\n</script>`;
}

export function toJsx(markup: string, name: string): string {
  let s = markup
    .replace(/stroke-width/g, 'strokeWidth')
    .replace(/stroke-linecap/g, 'strokeLinecap')
    .replace(/stroke-linejoin/g, 'strokeLinejoin')
    .replace(/fill-rule/g, 'fillRule')
    .replace(/clip-rule/g, 'clipRule')
    .replace(/xmlns="[^"]*"\s*/g, '');
  s = s.replace('<svg', '<svg {...props}');
  return `export const ${toPascalCase(name)}Icon = (props: React.SVGProps<SVGSVGElement>) => (\n  ${s}\n);`;
}
