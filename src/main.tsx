import {render} from 'preact'
import '@/index.css'
import '@/fusam.ts'
import 'bondage-club-mod-sdk'
import App from '@/app.tsx'
import {Logger} from "@/infrastructure/logging/Logger";
import {LogService} from "@/service/LogService.ts";
import {ModService} from "@/service/ModService.ts";
import {RegistryService} from "@/service/RegistryService.ts";
import {RegistryDataService} from "@/service/RegistryDataService.ts";
import {ModLoaderService} from "@/service/ModLoaderService.ts";
import {FusamMigrationService} from "@/service/FusamMigrationService.ts";
import {PlatformApiService} from "@/service/PlatformApiService.ts";
import {PlatformBridge} from "@/infrastructure/bridge/PlatformBridge.ts";

Logger.info('BC Mod Manager started', {platform: PlatformBridge.info().id});

// fetch all registries and cache data
RegistryDataService.fetchAllRegistries(RegistryService.getAll())
  .then(() => {
    Logger.info('Registry data fetched and cached');
  })
  .catch(error => {
    Logger.error('Error fetching registry data:', error);
  });

// Initialize mod loader to preload enabled mods
ModLoaderService.initialize();
ModLoaderService.preloadAllEnabledMods();

// Offer to import a previous FUSAM configuration when BMM has no enabled mods.
FusamMigrationService.init();

// System Information
LogService.registerDebugMethod('System Information', () => {
  return `
Platform: ${navigator.platform}
User Agent: ${navigator.userAgent}
Language: ${navigator.language}
Screen Resolution: ${window.screen.width}x${window.screen.height}
Window Size: ${window.innerWidth}x${window.innerHeight}
Online: ${navigator.onLine}
Cookie Enabled: ${navigator.cookieEnabled}
    `.trim();
});

// Mod Configurations
LogService.registerDebugMethod('Mod Configurations', () => {
  const configs = ModService.getAllConfigs();
  const stats = ModService.getStats();
  return `
Total Mods: ${configs.length}
Enabled Mods: ${stats.enabled}
Disabled Mods: ${stats.disabled}

Configurations:
${JSON.stringify(configs, null, 2)}
    `.trim();
});

// Registry Information
LogService.registerDebugMethod('Registry Information', () => {
  const registries = RegistryService.getAll();
  const cached = RegistryDataService.getAllCached();

  return `
Total Registries: ${registries.length}
Cached Registries: ${cached.length}

Registries:
${JSON.stringify(registries, null, 2)}

Cache Summary:
${cached.map(c => `- ${c.registryUrl}: ${c.modCount} mods, cached at ${new Date(c.fetchedAt).toLocaleString()}`).join('\n')}
    `.trim();
});

// LocalStorage Usage
LogService.registerDebugMethod('LocalStorage Usage', () => {
  let totalSize = 0;
  const items: Array<{ key: string; size: number }> = [];

  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      const size = localStorage[key].length + key.length;
      totalSize += size;
      items.push({key, size});
    }
  }

  items.sort((a, b) => b.size - a.size);

  return `
Total Keys: ${items.length}
Estimated Total Size: ${(totalSize / 1024).toFixed(2)} KB

Items (sorted by size):
${items.map(item => `- ${item.key}: ${(item.size / 1024).toFixed(2)} KB`).join('\n')}
    `.trim();
});

// Mod Loader Status
LogService.registerDebugMethod('Mod Loader Status', () => {
  const stats = ModLoaderService.getStats();
  const loadedMods = ModLoaderService.getLoadedMods();

  return `
Loaded Mods: ${stats.loadedCount}
Enabled Mods: ${stats.enabledCount}
Has Disabled Mods (Refresh Pending): ${stats.hasDisabledMods}

Loaded Mod Keys:
${loadedMods.length > 0 ? loadedMods.map(key => `- ${key}`).join('\n') : '(none)'}
    `.trim();
});

Logger.debug('Debug methods registered', {
  count: LogService.getDebugMethods().length
});

render(<App/>, window.bmm.root);

// Publish the public API (window.bmm.api) and hand it to the embedding host.
// Done after the app shell mounts so ui.* can drive the live App instance.
PlatformApiService.install();

ModLoaderService.loadAllEnabledMods();
