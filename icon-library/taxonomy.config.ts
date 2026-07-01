export interface LicenseDef {
  id: string;
  name: string;
  url: string | null;
}

export interface PredefinedBundle {
  id: string;
  name: string;
  strokeBased: boolean;
}

export const PREDEFINED_BUNDLES: PredefinedBundle[] = [
  { id: 'outline',    name: 'Outline',    strokeBased: true  },
  { id: 'solid',      name: 'Solid',      strokeBased: false },
  { id: 'monochrome', name: 'Monochrome', strokeBased: false },
  { id: 'duotone',    name: 'Duotone',    strokeBased: false },
  { id: 'color',      name: 'Color',      strokeBased: false },
  { id: 'flat',       name: 'Flat',       strokeBased: false },
];

export const DEFAULT_LICENSES: LicenseDef[] = [
  { id: 'cc0',         name: 'CC0 1.0',                         url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { id: 'cc-by-4',     name: 'CC BY 4.0',                       url: 'https://creativecommons.org/licenses/by/4.0/' },
  { id: 'cc-by-sa-4',  name: 'CC BY-SA 4.0',                    url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'mit',         name: 'MIT',                             url: 'https://opensource.org/licenses/MIT' },
  { id: 'apache-2',    name: 'Apache-2.0',                      url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  { id: 'eula',        name: 'Custom Commercial EULA',           url: null },
  { id: 'proprietary', name: 'Proprietary (All rights reserved)', url: null },
];

export const GRID_DENSITIES = [24, 28, 32] as const;
export type GridDensity = typeof GRID_DENSITIES[number];

export const DEFAULT_GRID_DENSITY: GridDensity = 28;
export const MAX_ICON_SIZE = 32;
