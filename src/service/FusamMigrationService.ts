import {Logger} from '@/infrastructure/logging/Logger';
import {ModService} from '@/service/ModService';
import {RegistryDataService} from '@/service/RegistryDataService';
import {BcGameState} from '@/service/BcGameState';
import {ModalStore} from '@/ui/store/ModalStore';
import {currentLanguage, t} from '@/i18n/i18n';
import {formatLocalizedName} from '@/util/format';

const BROWSER_SETTINGS_KEY = 'fusam.settings';
const MIGRATION_FLAG_KEY = 'bmm_fusam_migration_handled';
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60000;

interface MigrationItem {
  modId: string;
  registryId: string;
  name: string;
  version: string;
}

/**
 * Offers to import enabled mods from a previous FUSAM install. Only fires when
 * BMM has no enabled mods of its own, so an existing BMM setup is never touched.
 */
export class FusamMigrationService {
  private static started = false;
  private static pollTimer: number | null = null;
  private static elapsed = 0;

  static init(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    if (localStorage.getItem(MIGRATION_FLAG_KEY)) {
      return;
    }
    if (ModService.getEnabledCount() > 0) {
      return;
    }

    this.pollTimer = window.setInterval(() => {
      this.elapsed += POLL_INTERVAL_MS;
      if (this.tryOffer() || this.elapsed >= POLL_TIMEOUT_MS) {
        this.stop();
      }
    }, POLL_INTERVAL_MS);
  }

  private static stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** @returns true once a decision was reached (offer shown, or nothing to do). */
  private static tryOffer(): boolean {
    // The user may have enabled mods through BMM while we were waiting.
    if (ModService.getEnabledCount() > 0) {
      return true;
    }

    // Account-level FUSAM settings only load after login, and we need cached
    // registries to map addon ids to installable mods.
    if (!BcGameState.isLoggedIn() || !this.registriesReady()) {
      return false;
    }

    const distributions = this.readFusamDistributions();
    if (Object.keys(distributions).length === 0) {
      return true;
    }

    const plan = this.buildPlan(distributions);
    if (plan.length > 0) {
      this.offer(plan);
    }
    return true;
  }

  private static registriesReady(): boolean {
    return RegistryDataService.getAllCached().some(cache => cache.data && !cache.error);
  }

  private static readFusamDistributions(): Record<string, string> {
    return {
      ...this.readBrowserSettings(),
      ...this.readAccountSettings(),
    };
  }

  private static readBrowserSettings(): Record<string, string> {
    try {
      const raw = localStorage.getItem(BROWSER_SETTINGS_KEY);
      return raw ? this.normalize(JSON.parse(raw)) : {};
    } catch (error) {
      Logger.warn('FusamMigrationService: failed to read browser settings', error);
      return {};
    }
  }

  private static readAccountSettings(): Record<string, string> {
    try {
      const player = typeof Player !== 'undefined' ? Player : undefined;
      const raw = player?.ExtensionSettings?.FUSAMSettings ?? player?.OnlineSettings?.FUSAMSettings;
      if (!raw || typeof LZString === 'undefined') {
        return {};
      }
      const json = LZString.decompressFromBase64(raw);
      return json ? this.normalize(JSON.parse(json)) : {};
    } catch (error) {
      Logger.warn('FusamMigrationService: failed to read account settings', error);
      return {};
    }
  }

  /** Both the wrapped ({enabledDistributions}) and the legacy flat shapes. */
  private static normalize(parsed: unknown): Record<string, string> {
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const obj = parsed as Record<string, unknown>;
    const source = (obj.enabledDistributions && typeof obj.enabledDistributions === 'object')
      ? obj.enabledDistributions as Record<string, unknown>
      : obj;
    const result: Record<string, string> = {};
    for (const [id, distribution] of Object.entries(source)) {
      if (typeof distribution === 'string') {
        result[id] = distribution;
      }
    }
    return result;
  }

  private static buildPlan(distributions: Record<string, string>): MigrationItem[] {
    const available = ModService.getAvailableMods();
    const plan: MigrationItem[] = [];

    for (const [addonId, distribution] of Object.entries(distributions)) {
      const matches = available.filter(m => m.addon.id === addonId);
      if (matches.length === 0) {
        continue;
      }
      // Prefer a registry that offers the exact distribution FUSAM had selected.
      const chosen = matches.find(m => m.addon.versions.some(v => v.distribution === distribution)) ?? matches[0];
      const hasDistribution = chosen.addon.versions.some(v => v.distribution === distribution);
      plan.push({
        modId: chosen.addon.id,
        registryId: chosen.registryId,
        name: formatLocalizedName(chosen.addon.name, currentLanguage()),
        version: hasDistribution ? distribution : (chosen.addon.versions[0]?.distribution ?? distribution),
      });
    }

    return plan;
  }

  private static offer(plan: MigrationItem[]): void {
    Logger.info(`FusamMigrationService: offering migration of ${plan.length} mod(s)`);
    ModalStore.open({
      prompt: t('fusam-migrate-prompt', {count: plan.length, mods: plan.map(p => p.name).join(', ')}),
      buttons: {
        submit: t('fusam-migrate-confirm'),
        dismiss: t('fusam-migrate-dismiss'),
      },
      callback: (action) => {
        if (action === 'submit') {
          this.apply(plan);
        } else {
          localStorage.setItem(MIGRATION_FLAG_KEY, 'dismissed');
        }
      },
    });
  }

  private static apply(plan: MigrationItem[]): void {
    for (const item of plan) {
      ModService.saveConfig({
        modId: item.modId,
        registryId: item.registryId,
        enabled: true,
        selectedVersion: item.version,
      });
    }
    localStorage.setItem(MIGRATION_FLAG_KEY, 'migrated');
    Logger.info('FusamMigrationService: migration applied, reloading');
    window.location.reload();
  }
}