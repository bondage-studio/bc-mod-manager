import {Logger} from "@/infrastructure/logging/Logger";
import {PlatformBridge} from "@/infrastructure/bridge/PlatformBridge";

/**
 * LocalStorage - Handles all of BMM's key/value persistence.
 *
 * By default this is the browser's `localStorage`. An embedding host (Electron,
 * the reverse-proxy client) can take over persistence by supplying a storage
 * backend through the platform bridge — e.g. to scope BMM's data per game
 * account or to persist it server-side. The backend is resolved per call so it
 * works regardless of import order.
 */
export class LocalStorage {
  private static backend(): {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear?(): void;
  } {
    return PlatformBridge.storage() ?? localStorage;
  }

  /**
   * Get an item from storage
   * @param key - The key to retrieve
   * @returns The parsed value or null if not found
   */
  static getItem<T>(key: string): T | null {
    try {
      const item = this.backend().getItem(key);
      if (item === null) {
        return null;
      }
      return JSON.parse(item) as T;
    } catch (error) {
      Logger.error(`Error getting item from storage: ${key}`, error);
      return null;
    }
  }

  /**
   * Set an item in storage
   * @param key - The key to store
   * @param value - The value to store (will be JSON stringified)
   */
  static setItem<T>(key: string, value: T): void {
    try {
      this.backend().setItem(key, JSON.stringify(value));
    } catch (error) {
      Logger.error(`Error setting item in storage: ${key}`, error);
    }
  }

  /**
   * Remove an item from storage
   * @param key - The key to remove
   */
  static removeItem(key: string): void {
    try {
      this.backend().removeItem(key);
    } catch (error) {
      Logger.error(`Error removing item from storage: ${key}`, error);
    }
  }

  /**
   * Clear all items from storage
   */
  static clear(): void {
    try {
      const backend = this.backend();
      backend.clear?.();
    } catch (error) {
      Logger.error('Error clearing storage', error);
    }
  }
}
