'use client';
import type { IconVariant } from '@/types';
import { pathsToSvgInner } from '@/lib/svg-render';

interface Props {
  variant: IconVariant;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function SvgIcon({ variant, size = 24, color = 'currentColor', strokeWidth = 2, className }: Props) {
  const inner = pathsToSvgInner(variant.paths);
  const strokeProps = variant.strokeBased
    ? { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
    : { fill: color };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={variant.viewBox}
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
      {...strokeProps}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
