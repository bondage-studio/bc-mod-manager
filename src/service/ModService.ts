import {ModConfigRepository} from '@/repository/ModConfigRepository';
import {RegistryDataService} from '@/service/RegistryDataService';
import {ModLoaderService} from '@/service/ModLoaderService';
import {CustomExtensionService} from '@/service/CustomExtensionService';
import {currentLanguage} from '@/i18n/i18n';
import {formatLocalizedName, formatLocalizedText} from '@/util/format';
import {Observable} from '@/infrastructure/pubsub/Observable';
import {Logger} from '@/infrastructure/logging/Logger';
import type {ModConfig, ModWithDetails} from '@/domain/Mod';
import type {CachedRegistryData, FusamAddon} from '@/domain/Registry';

/**
 * Mod Service
 * Manages the user's mod configurations and combines them with registry data.
 * Persistence is delegated to {@link ModConfigRepository}.
 */
export class ModService {
  private static readonly repo = new ModConfigRepository();
  private static readonly observable = new Observable<ModConfig[]>({
    emitOnSubscribe: false,
    onListenerError: (error) => Logger.error('ModService: listener threw', error),
  });

  /**
   * Subscribe to mod-configuration changes (install / enable / version / remove).
   * The listener receives the full config list on each change. Returns an
   * unsubscribe function.
   */
  static subscribe(listener: (configs: ModConfig[]) => void): () => void {
    return this.observable.subscribe(listener);
  }

  private static notifyChange(): void {
    this.observable.notify(this.getAllConfigs());
  }

  /**
   * Get all mod configurations
   */
  static getAllConfigs(): ModConfig[] {
    return this.repo.getAll();
  }

  /**
   * Get a mod configuration by ID
   */
  static getConfig(modId: string, registryId: string): ModConfig | null {
    return this.repo.findByKey(`${modId}_${registryId}`);
  }

  /**
   * Add or update a mod configuration
   */
  static saveConfig(config: Omit<ModConfig, 'installedAt' | 'updatedAt'>): ModConfig {
    const existing = this.getConfig(config.modId, config.registryId);
    const now = Date.now();

    // Update existing config (preserving installedAt) or create a new one.
    const savedConfig: ModConfig = existing
      ? {...existing, ...config, updatedAt: now}
      : {...config, installedAt: now, updatedAt: now};

    this.repo.upsert(savedConfig);
    this.notifyChange();
    return savedConfig;
  }

  /**
   * Enable a mod
   */
  static enableMod(modId: string, registryId: string): boolean {
    const config = this.getConfig(modId, registryId);
    if (!config) return false;

    this.saveConfig({
      ...config,
      enabled: true,
    });
    return true;
  }

  /**
   * Change mod version
   */
  static changeVersion(modId: string, registryId: string, version: string): boolean {
    const config = this.getConfig(modId, registryId);
    if (!config) return false;

    this.saveConfig({
      ...config,
      selectedVersion: version,
    });
    return true;
  }

  /**
   * Remove a mod configuration
   */
  static removeConfig(modId: string, registryId: string): boolean {
    const config = this.getConfig(modId, registryId);

    // Mark mod as disabled for refresh tracking if it was enabled
    if (config && config.enabled) {
      ModLoaderService.markModDisabled(modId, registryId);
    }

    const removed = this.repo.removeByKey(`${modId}_${registryId}`);
    if (removed) {
      this.notifyChange();
    }
    return removed;
  }

  /**
   * Get all mods with full details from cached registry data (including custom extensions)
   */
  static getAllModsWithDetails(): ModWithDetails[] {
    const configs = this.getAllConfigs();
    const cachedData = RegistryDataService.getAllCached();
    const modsWithDetails: ModWithDetails[] = [];

    // Create a map of cached data by registry ID
    const cacheMap = new Map<string, CachedRegistryData>();
    cachedData.forEach(cache => {
      cacheMap.set(cache.registryId, cache);
    });

    // Create a map of custom extensions
    const customRegistryId = CustomExtensionService.getCustomRegistryId();
    const customExtensionsMap = new Map<string, any>();
    CustomExtensionService.toFusamAddons().forEach(addon => {
      customExtensionsMap.set(addon.id, addon);
    });

    // Combine configs with registry data
    configs.forEach(config => {
      // Check if it's a custom extension
      if (config.registryId === customRegistryId) {
        const addon = customExtensionsMap.get(config.modId);
        if (addon) {
          const availableVersions = addon.versions.map((v: any) => v.distribution);
          const selectedVersionData = addon.versions.find((v: any) => v.distribution === config.selectedVersion);

          modsWithDetails.push({
            ...config,
            name: formatLocalizedName(addon.name, currentLanguage()),
            nameLanguage: {en: addon.name},
            description: formatLocalizedText(addon.description, currentLanguage()),
            descriptionLanguage: typeof addon.description === 'object' ? addon.description : {en: addon.description},
            author: addon.author,
            repository: addon.repository,
            tags: addon.tags,
            type: addon.type,
            icon: addon.icon,
            website: addon.website,
            discord: addon.discord,
            // Custom (local/dev) extensions opt out of cache pinning so they
            // always load the freshest source while being developed.
            noCacheBusting: true,
            availableVersions: availableVersions,
            sourceUrl: selectedVersionData?.source,
          });
        }
        return;
      }

      // Handle registry mods
      const cache = cacheMap.get(config.registryId);
      if (!cache || !cache.data) return;

      // Only handle fusam type for now
      if (cache.registryType === 'fusam') {
        const fusamData = cache.data as any;
        const addon = fusamData.addons?.find((a: FusamAddon) => a.id === config.modId);

        if (addon) {
          const availableVersions = addon.versions.map((v: any) => v.distribution);
          const selectedVersionData = addon.versions.find((v: any) => v.distribution === config.selectedVersion);

          modsWithDetails.push({
            ...config,
            name: formatLocalizedName(addon.name, currentLanguage()),
            nameLanguage: typeof addon.name === 'object' ? addon.name : {en: addon.name},
            description: formatLocalizedText(addon.description, currentLanguage()),
            descriptionLanguage: typeof addon.description === 'object' ? addon.description : {en: addon.description},
            author: addon.author,
            repository: addon.repository,
            tags: addon.tags,
            type: addon.type,
            icon: addon.icon,
            website: addon.website,
            discord: addon.discord,
            noCacheBusting: addon.noCacheBusting,
            availableVersions: availableVersions,
            sourceUrl: selectedVersionData?.source,
          });
        }
      }
    });

    return modsWithDetails;
  }

  /**
   * Get available mods from all cached registries (including custom extensions)
   */
  static getAvailableMods(): Array<{
    addon: FusamAddon;
    registryId: string;
    registryUrl: string;
    config: ModConfig | null;
  }> {
    const configs = this.getAllConfigs();
    const cachedData = RegistryDataService.getAllCached();
    const availableMods: Array<{
      addon: FusamAddon;
      registryId: string;
      registryUrl: string;
      config: ModConfig | null;
    }> = [];

    // Add custom extensions
    const customExtensions = CustomExtensionService.toFusamAddons();
    const customRegistryId = CustomExtensionService.getCustomRegistryId();
    customExtensions.forEach(addon => {
      const config = configs.find(
        c => c.modId === addon.id && c.registryId === customRegistryId
      ) || null;

      availableMods.push({
        addon,
        registryId: customRegistryId,
        registryUrl: 'Custom Extensions',
        config,
      });
    });

    // Add mods from registries
    cachedData.forEach(cache => {
      if (!cache.data || cache.error) return;

      // Only handle fusam type for now
      if (cache.registryType === 'fusam') {
        const fusamData = cache.data as any;
        fusamData.addons?.forEach((addon: FusamAddon) => {
          const config = configs.find(
            c => c.modId === addon.id && c.registryId === cache.registryId
          ) || null;

          availableMods.push({
            addon,
            registryId: cache.registryId,
            registryUrl: cache.registryUrl,
            config,
          });
        });
      }
    });

    return availableMods;
  }

  /**
   * Get enabled mods count
   */
  static getEnabledCount(): number {
    const configs = this.getAllConfigs();
    return configs.filter(c => c.enabled).length;
  }

  /**
   * Get total mods count
   */
  static getTotalCount(): number {
    return this.getAllConfigs().length;
  }

  /**
   * Get mod statistics
   */
  static getStats(): { total: number; enabled: number; disabled: number } {
    const configs = this.getAllConfigs();
    const enabled = configs.filter(c => c.enabled).length;
    return {
      total: configs.length,
      enabled,
      disabled: configs.length - enabled,
    };
  }

  /**
   * Clear all mod configurations
   */
  static clearAll(): void {
    this.repo.clear();
    this.notifyChange();
  }
}
