'use client';
import { useMemo } from 'react';
import Fuse from 'fuse.js';
import type { IconMeta } from '@/types';

export function useSearch(icons: IconMeta[], query: string, bundleId: string) {
  const fuse = useMemo(
    () => new Fuse(icons, { keys: ['name', 'tags', 'categoryId', 'subcategoryId'], threshold: 0.3 }),
    [icons]
  );

  return useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query).map(r => r.item);
  }, [fuse, query]);
}
