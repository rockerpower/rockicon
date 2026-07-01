import { optimize } from 'svgo';
import type { PathNode } from '../types';

const PRESENTATION_ATTRS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity'];

// Normalize a raw SVG string into { viewBox, paths } with presentation attrs
// stripped (applied at render time). Shared by build:icons and Pro delivery.
export function normalizeSvg(raw: string): { viewBox: string; paths: PathNode[] } {
  const result = optimize(raw, {
    plugins: [
      { name: 'preset-default', params: { overrides: { cleanupIds: false } } },
      { name: 'removeAttrs', params: { attrs: ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'width', 'height'] } },
    ],
  });

  const svg = result.data;
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 24 24';

  const paths: PathNode[] = [];
  const tagRe = /<(path|circle|rect|line|polyline|polygon|ellipse)([^/]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg)) !== null) {
    const tag = m[1] as PathNode['tag'];
    const attrsStr = m[2];
    const attrs: Record<string, string | number> = {};
    const attrRe = /(\w[\w-]*)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(attrsStr)) !== null) {
      const [, k, v] = a;
      if (PRESENTATION_ATTRS.includes(k)) continue;
      attrs[k] = v;
    }
    paths.push({ tag, attrs });
  }

  return { viewBox, paths };
}
