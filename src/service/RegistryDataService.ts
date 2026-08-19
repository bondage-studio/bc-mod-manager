import {RegistryCacheRepository} from '@/repository/RegistryCacheRepository';
import {Logger} from '@/infrastructure/logging/Logger';
import {PlatformBridge} from '@/infrastructure/bridge/PlatformBridge';
import type {AuroraRegistryData, CachedRegistryData, FusamRegistryData, Registry} from '@/domain/Registry';

/**
 * Registry Data Service
 * Handles fetching and parsing registry data; persistence is delegated to
 * {@link RegistryCacheRepository}.
 */
export class RegistryDataService {
  private static readonly repo = new RegistryCacheRepository();

  /**
   * Get all cached registry data
   */
  static getAllCached(): CachedRegistryData[] {
    return this.repo.getAll();
  }

  /**
   * Get cached data for a specific registry
   */
  static getCached(registryId: string): CachedRegistryData | null {
    return this.repo.findByKey(registryId);
  }

  /**
   * Fetch registry data from URL
   */
  static async fetchRegistry(registry: Registry): Promise<CachedRegistryData> {
    const startTime = Date.now();

    try {
      Logger.info(`Fetching registry data from: ${registry.url}`);

      const response = await PlatformBridge.fetch(registry.url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-cache',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Parse based on registry type
      let modCount = 0;
      let parsedData: FusamRegistryData | AuroraRegistryData | null = null;

      if (registry.type === 'fusam') {
        parsedData = data as FusamRegistryData;
        modCount = parsedData.addons?.length || 0;
      } else if (registry.type === 'aurora') {
        // TODO: Parse aurora format when structure is known
        parsedData = data as AuroraRegistryData;
        modCount = 0; // Update based on aurora structure
      }

      const cachedData: CachedRegistryData = {
        registryId: registry.id,
        registryUrl: registry.url,
        registryType: registry.type,
        data: parsedData,
        modCount: modCount,
        fetchedAt: Date.now(),
        error: null,
      };

      // Save to cache
      this.repo.upsert(cachedData);

      Logger.info(`Successfully fetched ${modCount} mods in ${Date.now() - startTime}ms`);

      return cachedData;
    } catch (error) {
      Logger.error('Error fetching registry:', error);

      const cachedData: CachedRegistryData = {
        registryId: registry.id,
        registryUrl: registry.url,
        registryType: registry.type,
        data: null,
        modCount: 0,
        fetchedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      // Save error to cache
      this.repo.upsert(cachedData);

      return cachedData;
    }
  }

  /**
   * Fetch all registries
   */
  static async fetchAllRegistries(registries: Registry[]): Promise<CachedRegistryData[]> {
    const promises = registries.map(registry => this.fetchRegistry(registry));
    return Promise.all(promises);
  }

  /**
   * Clear cache for a specific registry
   */
  static clearCache(registryId: string): void {
    this.repo.removeByKey(registryId);
  }

  /**
   * Clear all cache
   */
  static clearAllCache(): void {
    this.repo.clear();
  }

  /**
   * Get cache age in milliseconds
   */
  static getCacheAge(cachedData: CachedRegistryData): number {
    return Date.now() - cachedData.fetchedAt;
  }

  /**
   * Format cache age as human-readable string
   */
  static formatCacheAge(cachedData: CachedRegistryData): string {
    const ageMs = this.getCacheAge(cachedData);
    const ageSeconds = Math.floor(ageMs / 1000);
    const ageMinutes = Math.floor(ageSeconds / 60);
    const ageHours = Math.floor(ageMinutes / 60);
    const ageDays = Math.floor(ageHours / 24);

    if (ageDays > 0) {
      return `${ageDays} day${ageDays > 1 ? 's' : ''} ago`;
    } else if (ageHours > 0) {
      return `${ageHours} hour${ageHours > 1 ? 's' : ''} ago`;
    } else if (ageMinutes > 0) {
      return `${ageMinutes} minute${ageMinutes > 1 ? 's' : ''} ago`;
    } else {
      return `${ageSeconds} second${ageSeconds !== 1 ? 's' : ''} ago`;
    }
  }

  /**
   * Check if cache is stale (older than specified time)
   */
  static isCacheStale(cachedData: CachedRegistryData, maxAgeMs: number = 3600000): boolean {
    return this.getCacheAge(cachedData) > maxAgeMs;
  }
}
