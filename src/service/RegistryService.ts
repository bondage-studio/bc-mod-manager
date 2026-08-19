import {RegistryRepository} from '@/repository/RegistryRepository';
import {Logger} from '@/infrastructure/logging/Logger';
import {RegistryDataService} from "@/service/RegistryDataService.ts";
import type {Registry, RegistryType} from '@/domain/Registry';

/**
 * Registry Service
 * Manages mod registries with CRUD operations; persistence of user registries
 * is delegated to {@link RegistryRepository}.
 */
export class RegistryService {
  private static readonly repo = new RegistryRepository();

  /**
   * Preset registry URLs that cannot be deleted or modified
   */
  private static readonly PRESET_REGISTRIES: Registry[] = [
    {
      id: 'sidiousious',
      url: 'https://sidiousious.gitlab.io/bc-addon-loader/manifest.json',
      type: 'fusam',
      createdAt: Date.parse('2025-10-16T00:00:00Z'),
      updatedAt: Date.parse('2025-10-16T00:00:00Z'),
      isPreset: true,
    },
    {
      id: 'inkerbot',
      url: 'https://bondage-studio.github.io/bc-mod-manager/manifest.json',
      type: 'fusam',
      createdAt: Date.parse('2025-10-16T00:00:00Z'),
      updatedAt: Date.parse('2025-10-16T00:00:00Z'),
      isPreset: true,
    },
    {
      id: 'awdrrawd',
      url: 'https://awdrrawd.github.io/liko-Plugin-Repository/manifest.json',
      type: 'fusam',
      createdAt: Date.parse('2025-10-18T00:00:00Z'),
      updatedAt: Date.parse('2025-10-18T00:00:00Z'),
      isPreset: true,
    },
  ];


  static getAll(): Registry[] {
    return [...this.PRESET_REGISTRIES, ...this.getAllUser()];
  }

  /**
   * Get all user-added registries
   * @returns Array of user registries
   */
  static getAllUser(): Registry[] {
    return this.repo.getAll();
  }

  /**
   * Get a registry by ID
   * @param id - The registry ID
   * @returns The registry or null if not found
   */
  static getById(id: string): Registry | null {
    const registries = this.getAll();
    return registries.find(r => r.id === id) || null;
  }

  /**
   * Add a new registry
   * @param url - The registry URL
   * @param type - The registry type (default: 'fusam')
   * @returns The created registry or null if failed
   */
  static add(url: string, type: RegistryType = 'fusam'): Registry | null {
    if (!this.isValidUrl(url)) {
      Logger.error('Invalid URL format');
      return null;
    }

    const registries = this.getAllUser();

    // Check for duplicate URLs
    if (registries.some(r => r.url === url)) {
      Logger.error('Registry URL already exists');
      return null;
    }

    const now = Date.now();
    const newRegistry: Registry = {
      id: this.generateId(),
      url: url.trim(),
      type: type,
      createdAt: now,
      updatedAt: now,
    };

    this.repo.upsert(newRegistry);
    RegistryDataService.fetchRegistry(newRegistry)
      .catch(error => {
        Logger.error('Error fetching registry:', error);
      });
    return newRegistry;
  }

  /**
   * Update an existing registry
   * @param id - The registry ID
   * @param url - The new URL
   * @param type - The registry type (optional)
   * @returns The updated registry or null if failed
   */
  static update(id: string, url: string, type?: RegistryType): Registry | null {
    if (!this.isValidUrl(url)) {
      Logger.error('Invalid URL format');
      return null;
    }

    const registries = this.getAllUser();
    const index = registries.findIndex(r => r.id === id);

    if (index === -1) {
      Logger.error('Registry not found');
      return null;
    }

    // Check for duplicate URLs (excluding current registry)
    if (registries.some(r => r.id !== id && r.url === url)) {
      Logger.error('Registry URL already exists');
      return null;
    }

    const updated: Registry = {
      ...registries[index],
      url: url.trim(),
      updatedAt: Date.now(),
    };
    if (type !== undefined) {
      updated.type = type;
    }

    this.repo.upsert(updated);

    RegistryDataService.fetchRegistry(updated)
      .catch(error => {
        Logger.error('Error fetching registry:', error);
      });

    return updated;
  }

  /**
   * Delete a registry
   * @param id - The registry ID
   * @returns true if successful, false otherwise
   */
  static delete(id: string): boolean {
    if (!this.repo.removeByKey(id)) {
      Logger.error('Registry not found');
      return false;
    }

    return true;
  }

  /**
   * Delete all registries
   * @returns true if successful, false otherwise
   */
  static deleteAll(): boolean {
    this.repo.clear();
    return true;
  }

  /**
   * Generate a unique ID
   * @returns A unique ID string
   */
  private static generateId(): string {
    return `registry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate URL format
   * @param url - The URL to validate
   * @returns true if valid, false otherwise
   */
  private static isValidUrl(url: string): boolean {
    if (!url || url.trim().length === 0) {
      return false;
    }

    try {
      const urlObj = new URL(url.trim());
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
