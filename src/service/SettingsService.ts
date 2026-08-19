import {SettingsRepository} from '@/repository/SettingsRepository';
import {Observable} from '@/infrastructure/pubsub/Observable';
import {Logger} from '@/infrastructure/logging/Logger';
import {PlatformBridge} from '@/infrastructure/bridge/PlatformBridge';
import type {AppSettings} from '@/domain/Settings';

/**
 * Settings Service
 * Reads/writes user preferences (via {@link SettingsRepository}) and notifies
 * subscribers when they change.
 *
 * An embedding host may pin a subset of settings via the platform bridge. Pinned
 * keys override the stored value on read and reject writes ({@link isLocked}), so
 * the host stays in control while the UI shows them as managed.
 */
export class SettingsService {
  private static readonly repo = new SettingsRepository();
  private static readonly observable = new Observable<AppSettings>({
    emitOnSubscribe: false,
    onListenerError: (error) => Logger.error('SettingsService: listener threw', error),
  });

  /**
   * Get the full settings object, with defaults filled in for missing keys and
   * host-pinned overrides applied on top.
   */
  static getAll(): AppSettings {
    return {...this.repo.get(), ...PlatformBridge.settingsOverrides()};
  }

  static get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.getAll()[key];
  }

  /** Whether a key is pinned by the host and therefore read-only. */
  static isLocked<K extends keyof AppSettings>(key: K): boolean {
    return key in PlatformBridge.settingsOverrides();
  }

  static set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    if (this.isLocked(key)) {
      Logger.warn(`SettingsService: ignoring write to host-managed setting '${String(key)}'`);
      return;
    }
    // Persist only the user-owned slice; overrides are layered back on read.
    const next = {...this.repo.get(), [key]: value};
    this.repo.set(next);
    Logger.info(`SettingsService: ${String(key)} set to ${String(value)}`);
    this.observable.notify(this.getAll());
  }

  static subscribe(listener: (settings: AppSettings) => void): () => void {
    return this.observable.subscribe(listener);
  }
}
