/**
 * Mod Configuration
 * Stores the user's mod preferences.
 */
export interface ModConfig {
  modId: string;                    // Unique mod ID from registry
  registryId: string;               // Which registry this mod is from
  enabled: boolean;                 // Whether the mod is enabled
  selectedVersion: string;          // Selected distribution (e.g., "stable", "dev", "beta")
  installedAt: number;              // Timestamp when mod was first added
  updatedAt: number;                // Timestamp when config was last updated
}

/**
 * Mod with full details (combines config + registry data).
 */
export interface ModWithDetails extends ModConfig {
  name: string;
  nameLanguage?: Record<string, string>;
  descriptionLanguage?: Record<string, string>;
  description: string;
  author: string;
  repository?: string;
  tags?: string[];
  type?: string;
  icon?: string;
  website?: string;
  discord?: string;
  noCacheBusting?: boolean;          // Author opted out of cache busting (load URL verbatim)
  availableVersions: string[];      // List of available distributions
  sourceUrl?: string;               // URL to the selected version's source
}
