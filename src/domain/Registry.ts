/**
 * Registry type options
 */
export type RegistryType = 'fusam' | 'aurora';

/**
 * Registry
 * Represents a mod registry with a unique ID, URL, and type.
 */
export interface Registry {
  id: string;
  url: string;
  type: RegistryType;
  createdAt: number;
  updatedAt: number;
  isPreset?: boolean;
}

/**
 * Fusam Registry Data Structure
 */
export interface FusamAddon {
  id: string;
  name: string | Record<string, string>;
  description: string | Record<string, string>;
  author: string;
  repository?: string;
  tags?: string[];
  type?: string;
  icon?: string;
  website?: string;
  discord?: string;
  noCacheBusting?: boolean;
  versions: Array<{
    distribution: string;
    source: string;
  }>;
}

export interface FusamRegistryData {
  version: string;
  addons: FusamAddon[];
}

/**
 * Aurora Registry Data Structure (placeholder - adjust based on actual structure)
 */
export interface AuroraRegistryData {
  // TODO: Define based on actual aurora registry structure
  [key: string]: any;
}

/**
 * Cached Registry Data
 */
export interface CachedRegistryData {
  registryId: string;
  registryUrl: string;
  registryType: RegistryType;
  data: FusamRegistryData | AuroraRegistryData | null;
  modCount: number;
  fetchedAt: number;
  error: string | null;
}
