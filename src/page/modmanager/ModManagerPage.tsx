import { Component } from "preact";
import { ModService } from "@/service/ModService";
import { ModLoaderService } from "@/service/ModLoaderService";
import { RegistryService } from "@/service/RegistryService";
import { ModalStore } from "@/ui/store/ModalStore";
import type { ModConfig } from "@/domain/Mod";
import type { FusamAddon, Registry } from "@/domain/Registry";
import type { ModLoadEntry, ModLoadStatus } from "@/domain/ModLoad";
import { currentLanguage, t } from "@/i18n/i18n.ts";
import {
  formatDuration,
  formatInitial,
  formatLocalizedName,
  formatLocalizedText,
  formatSearchText,
  localizedTextSearchValues,
} from "@/util/format.ts";
import CategorySidebar, { RECOMMEND_MOD_IDS, type Category } from "@/component/CategorySidebar";
import CustomExtensionModal from "@/component/CustomExtensionModal";
import Alert from "@/component/ui/Alert";
import Badge, { type BadgeVariant } from "@/component/ui/Badge";
import Button from "@/component/ui/Button";
import EmptyState from "@/component/ui/EmptyState";
import Icon from "@/component/ui/Icon";
import Input from "@/component/ui/Input";
import List from "@/component/ui/List";
import ListRow from "@/component/ui/ListRow";
import Page from "@/component/ui/Page";
import Select from "@/component/ui/Select";

const LOAD_STATUS_LABEL_KEY: Record<ModLoadStatus, string> = {
  pending: "loading-status-pending",
  loading: "loading-status-loading",
  loaded: "loading-status-loaded",
  error: "loading-status-error",
};

const LOAD_STATUS_VARIANT: Record<ModLoadStatus, BadgeVariant> = {
  pending: "neutral",
  loading: "primary",
  loaded: "success",
  error: "danger",
};

type TagColorStyle = {
  backgroundColor: string;
  borderColor: string;
  color: string;
};

function getSortedUniqueTags(mods: ModManagerState["availableMods"]): string[] {
  return Array.from(new Set(mods.flatMap((mod) => mod.addon.tags || []))).sort((a, b) => a.localeCompare(b));
}

function buildTagColorMap(tags: string[]): Map<string, TagColorStyle> {
  const map = new Map<string, TagColorStyle>();

  if (tags.length === 0) {
    return map;
  }

  tags.forEach((tag, index) => {
    const hue = Math.round((index * 360) / tags.length);

    map.set(tag, {
      backgroundColor: `hsl(${hue} 62% 96%)`,
      borderColor: `hsl(${hue} 56% 72%)`,
      color: `hsl(${hue} 48% 30%)`,
    });
  });

  return map;
}

function getTagStyle(tagColorMap: Map<string, TagColorStyle>, tag: string): TagColorStyle | undefined {
  return tagColorMap.get(tag);
}

interface ModManagerState {
  availableMods: Array<{
    addon: FusamAddon;
    registryId: string;
    registryUrl: string;
    config: ModConfig | null;
  }>;
  filter: "all" | "enabled" | "disabled";
  searchQuery: string;
  error: string | null;
  expandedModId: string | null;
  // Track selected versions for mods that aren't installed yet
  pendingVersions: Map<string, string>; // key: `${modId}_${registryId}`, value: version
  showCustomExtensionModal: boolean;
  // Actual load status per mod, keyed by `${modId}_${registryId}`.
  loadStatus: Map<string, ModLoadEntry>;
  // Currently selected category in the left sidebar (All / Recommend / a tag
  // / a registry source). Defaults to "all".
  selectedCategory: Category;
  // Cached snapshot of all known registries (presets + user-added) so the
  // sidebar can render registry entries even when no mod comes from them.
  registries: Registry[];
}

export default class ModManagerPage extends Component<{}, ModManagerState> {
  private unsubscribeLoadStatus?: () => void;

  constructor(props: {}) {
    super(props);
    this.state = {
      availableMods: [],
      filter: "all",
      searchQuery: "",
      error: null,
      expandedModId: null,
      pendingVersions: new Map(),
      showCustomExtensionModal: false,
      loadStatus: new Map(),
      selectedCategory: { type: "all" },
      registries: RegistryService.getAll(),
    };
  }

  componentDidMount() {
    this.loadMods();
    // Keep the per-mod load status live so badges reflect the real outcome,
    // including mods still loading or that crashed after the manager opened.
    this.unsubscribeLoadStatus = ModLoaderService.subscribeProgress((progress) => {
      const loadStatus = new Map<string, ModLoadEntry>();
      progress.entries.forEach((entry) => loadStatus.set(entry.modKey, entry));
      this.setState({ loadStatus });
    });
  }

  componentWillUnmount() {
    this.unsubscribeLoadStatus?.();
  }

  loadMods = () => {
    const availableMods = ModService.getAvailableMods();
    // Refresh the registry snapshot too, so the sidebar picks up newly added
    // or removed user registries without a page reload.
    this.setState({ availableMods, registries: RegistryService.getAll() });
  };

  handleCategorySelect = (category: Category) => {
    this.setState({ selectedCategory: category });
  };

  handleInstallMod = (modId: string, registryId: string) => {
    const uniqueKey = `${modId}_${registryId}`;
    const config = ModService.getConfig(modId, registryId);

    if (!config) {
      // Get the selected version from pendingVersions or use default
      const selectedVersion = this.state.pendingVersions.get(uniqueKey);
      const mod = this.state.availableMods.find((m) => m.addon.id === modId && m.registryId === registryId);

      if (mod && mod.addon.versions.length > 0) {
        ModService.saveConfig({
          modId,
          registryId,
          enabled: true,
          selectedVersion: selectedVersion || mod.addon.versions[0].distribution,
        });

        // Clear pending version after install
        const newPendingVersions = new Map(this.state.pendingVersions);
        newPendingVersions.delete(uniqueKey);
        this.setState({ pendingVersions: newPendingVersions });
      }
    } else {
      ModService.enableMod(modId, registryId);
    }
    this.loadMods();
  };

  handleVersionChange = (modId: string, registryId: string, version: string, isInstalled: boolean) => {
    const uniqueKey = `${modId}_${registryId}`;

    if (isInstalled) {
      // For installed mods, update the config directly
      ModService.changeVersion(modId, registryId, version);
      this.loadMods();
    } else {
      // For non-installed mods, store in pendingVersions
      const newPendingVersions = new Map(this.state.pendingVersions);
      newPendingVersions.set(uniqueKey, version);
      this.setState({ pendingVersions: newPendingVersions });
    }
  };

  handleRemoveMod = async (modId: string, registryId: string) => {
    if (await ModalStore.confirm(t("confirm-remove-mod"), { confirmLabel: t("button-remove-mod") })) {
      const uniqueKey = `${modId}_${registryId}`;
      ModService.removeConfig(modId, registryId);

      // Clear pending version if exists
      const newPendingVersions = new Map(this.state.pendingVersions);
      newPendingVersions.delete(uniqueKey);
      this.setState({ pendingVersions: newPendingVersions });

      this.loadMods();
    }
  };

  handleFilterChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    this.setState({ filter: target.value as "all" | "enabled" | "disabled" });
  };

  handleSearchChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    this.setState({ searchQuery: target.value });
  };

  toggleExpanded = (modId: string) => {
    this.setState((prevState) => ({
      expandedModId: prevState.expandedModId === modId ? null : modId,
    }));
  };

  handleOpenCustomExtensionModal = () => {
    this.setState({ showCustomExtensionModal: true });
  };

  handleCloseCustomExtensionModal = () => {
    this.setState({ showCustomExtensionModal: false });
  };

  handleCustomExtensionChanged = () => {
    // Reload mods when custom extensions are added/updated/deleted
    this.loadMods();
  };

  getFilteredMods = () => {
    const { availableMods, filter, searchQuery, selectedCategory } = this.state;

    let filtered = availableMods;

    // Apply sidebar category filter first (all / recommend / tag / registry).
    if (selectedCategory.type === "recommend") {
      filtered = filtered.filter((m) => m.addon.tags?.includes("recommend") || RECOMMEND_MOD_IDS.has(m.addon.id));
    } else if (selectedCategory.type === "tag") {
      filtered = filtered.filter((m) => m.addon.tags?.includes(selectedCategory.value));
    } else if (selectedCategory.type === "registry") {
      filtered = filtered.filter((m) => m.registryId === selectedCategory.value);
    }
    // selectedCategory.type === 'all' → no extra filter

    // Apply enabled/disabled filter
    if (filter === "enabled") {
      filtered = filtered.filter((m) => m.config?.enabled);
    } else if (filter === "disabled") {
      filtered = filtered.filter((m) => !m.config?.enabled);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((m) => {
        const localizedNames = typeof m.addon.name === "string" ? [m.addon.name] : Object.values(m.addon.name);
        const searchableText = formatSearchText([
          ...localizedNames,
          ...localizedTextSearchValues(m.addon.description),
          m.addon.author,
          m.addon.id,
          m.registryUrl,
          ...(m.addon.tags || []),
          ...m.addon.versions.map((version) => version.distribution),
        ]);

        return searchableText.includes(query);
      });
    }

    return filtered;
  };

  /**
   * Badge showing a mod's actual load outcome (loaded / failed / loading /
   * pending), with the load time and any error surfaced on hover.
   */
  renderLoadBadge = (modKey: string) => {
    const entry = this.state.loadStatus.get(modKey);

    if (!entry) {
      return (
        <Badge variant="neutral" title={t("loading-status-not-loaded")}>
          {t("loading-status-not-loaded")}
        </Badge>
      );
    }

    const label = t(LOAD_STATUS_LABEL_KEY[entry.status]);
    const showDuration = entry.durationMs !== undefined && (entry.status === "loaded" || entry.status === "error");

    return (
      <Badge variant={LOAD_STATUS_VARIANT[entry.status]} title={entry.error || label}>
        {label}
        {showDuration ? ` · ${formatDuration(entry.durationMs!)}` : ""}
      </Badge>
    );
  };

  render() {
    const { error, expandedModId, showCustomExtensionModal } = this.state;
    const filteredMods = this.getFilteredMods();
    const enabledCount = ModService.getEnabledCount();
    const totalCount = this.state.availableMods.length;

    const sortedTags = getSortedUniqueTags(this.state.availableMods);
    const tagColorMap = buildTagColorMap(sortedTags);

    const loadEntries = Array.from(this.state.loadStatus.values());
    const loadedCount = loadEntries.filter((entry) => entry.status === "loaded").length;
    const failedCount = loadEntries.filter((entry) => entry.status === "error").length;

    return (
      <Page size="xl">
        <div className="mb-3 space-y-2">
          <h1 className="px-10 text-center text-lg font-extrabold tracking-tight text-bmm-ink sm:px-0">
            {t("title-mod-manager")}
          </h1>

          <div className="flex flex-col gap-2 rounded-md border border-bmm-border bg-bmm-surface px-3 py-2 text-xs lg:flex-row lg:items-center">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 lg:min-w-0 lg:flex-1">
              <span className="font-medium text-bmm-accent">
                <strong className="font-extrabold">{totalCount}</strong> {t("label-total-mods")}
              </span>

              <span className="text-bmm-border-strong">·</span>

              <span className="font-medium text-emerald-700">
                <strong className="font-extrabold">{enabledCount}</strong> {t("label-enabled-mods")}
              </span>

              <span className="text-bmm-border-strong">·</span>

              <span className="font-medium text-amber-700">
                <strong className="font-extrabold">{totalCount - enabledCount}</strong> {t("label-disabled-mods")}
              </span>

              <span className="text-bmm-border-strong">·</span>

              <span className="font-medium text-emerald-700">
                <strong className="font-extrabold">{loadedCount}</strong> {t("label-loaded-mods")}
              </span>

              {failedCount > 0 && (
                <>
                  <span className="text-bmm-border-strong">·</span>

                  <span className="font-medium text-red-700">
                    <strong className="font-extrabold">{failedCount}</strong> {t("label-failed-mods")}
                  </span>
                </>
              )}
            </div>

            <div className="min-w-0 lg:w-[22rem]">
              <Input
                type="text"
                aria-label={t("placeholder-search-mods")}
                placeholder={t("placeholder-search-mods")}
                value={this.state.searchQuery}
                onInput={this.handleSearchChange}
                className="h-8 w-full border-bmm-border-strong bg-bmm-surface-raised px-3 shadow-inner focus:border-bmm-accent focus:bg-white focus:shadow-[0_0_0_2px_rgb(37_99_235/0.12)]"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:shrink-0 lg:justify-end">
              <Button onClick={this.handleOpenCustomExtensionModal} variant="neutral" size="sm" className="shrink-0">
                + {t("button-manage-custom-extensions")}
              </Button>

              <Select
                value={this.state.filter}
                onChange={this.handleFilterChange}
                compact
                className="w-full sm:w-auto sm:min-w-40"
              >
                <option value="all">{t("filter-all-mods")}</option>
                <option value="enabled">{t("filter-enabled-only")}</option>
                <option value="disabled">{t("filter-disabled-only")}</option>
              </Select>
            </div>
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        {/* Sidebar + Mod List */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <CategorySidebar
            availableMods={this.state.availableMods}
            registries={this.state.registries}
            selected={this.state.selectedCategory}
            onSelect={this.handleCategorySelect}
          />
          {/* Mod List */}
          <List className="min-w-0 flex-1">
            {filteredMods.length === 0 ? (
              totalCount === 0 ? (
                <EmptyState title={t("no-mods-available")} description={t("no-mods-available-detail")} />
              ) : (
                <EmptyState title={t("no-mods-match-search")} />
              )
            ) : (
              <div>
                {filteredMods.map((mod) => {
                  const isEnabled = mod.config?.enabled || false;
                  const uniqueId = `${mod.addon.id}_${mod.registryId}`;
                  const modName = formatLocalizedName(mod.addon.name, currentLanguage());
                  const modDescription = formatLocalizedText(mod.addon.description, currentLanguage());
                  const modInitial = formatInitial(modName);

                  // Get selected version: from config if installed, from pendingVersions if not, or default
                  const selectedVersion = isEnabled
                    ? mod.config?.selectedVersion || mod.addon.versions[0]?.distribution || ""
                    : this.state.pendingVersions.get(uniqueId) || mod.addon.versions[0]?.distribution || "";

                  const isExpanded = expandedModId === uniqueId;
                  const categoryTags = mod.addon.tags?.slice(0, 4) || [];
                  const authorLabel = mod.addon.author ? t("label-author-by", { author: mod.addon.author }) : "";

                  return (
                    <ListRow
                      key={uniqueId}
                      className="relative px-3 py-2 transition-[background,box-shadow] duration-150 hover:bg-slate-50 hover:shadow-[inset_3px_0_0_rgb(100_116_139),0_1px_0_rgb(15_23_42/0.06)]"
                    >
                      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[2rem_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3">
                        <div
                          onClick={() => this.toggleExpanded(uniqueId)}
                          className="flex cursor-pointer select-none items-start gap-2 rounded-md -mx-1 px-1 py-0.5 transition-colors active:bg-slate-100 sm:contents sm:cursor-default sm:select-auto"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-bmm-border bg-bmm-surface-raised text-xs font-bold text-bmm-muted">
                            {mod.addon.icon ? (
                              <img
                                src={mod.addon.icon}
                                alt=""
                                className="h-6 w-6 rounded object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              modInitial
                            )}
                          </div>

                          <div className="min-w-0 flex-1 sm:flex-none">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 sm:flex-nowrap sm:overflow-hidden">
                              <h3 className="truncate text-sm font-bold leading-5 text-bmm-ink">{modName}</h3>

                              {authorLabel && (
                                <>
                                  <span className="shrink-0 text-xs text-bmm-faint">-</span>
                                  <span className="shrink-0 text-xs text-bmm-faint">{authorLabel}</span>
                                </>
                              )}

                              {categoryTags.length > 0 && (
                                <>
                                  <span className="shrink-0 text-xs text-bmm-faint">-</span>

                                  <div className="flex min-w-0 shrink items-center gap-1 overflow-hidden">
                                    {categoryTags.map((tag) => (
                                      <Badge
                                        key={tag}
                                        variant="neutral"
                                        style={getTagStyle(tagColorMap, tag)}
                                        className="shrink-0 px-1.5 py-0.5 text-[0.6875rem] leading-none font-light shadow-none"
                                      >
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                </>
                              )}

                              {isEnabled && (
                                <div className="ml-1 flex shrink-0 items-center gap-1">
                                  <Badge
                                    variant="success"
                                    className="px-1.5 py-0.5 text-[0.6875rem] font-light leading-none"
                                  >
                                    {t("label-installed")}
                                  </Badge>
                                  {this.renderLoadBadge(uniqueId)}
                                </div>
                              )}
                            </div>

                            {modDescription && (
                              <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-bmm-muted sm:line-clamp-1">
                                {modDescription}
                              </p>
                            )}
                          </div>

                          <span className="flex h-8 shrink-0 items-center text-bmm-faint sm:hidden">
                            <Icon name="chevron" className={isExpanded ? "-rotate-90" : "rotate-90"} />
                          </span>
                        </div>

                        <div className="flex gap-2 sm:contents">
                          <Button
                            onClick={() => this.toggleExpanded(uniqueId)}
                            variant="ghost"
                            size="sm"
                            icon={<Icon name="chevron" className={isExpanded ? "-rotate-90" : "rotate-90"} />}
                            className="justify-center max-sm:hidden sm:flex-none"
                          >
                            {isExpanded ? t("button-less") : t("button-more")}
                          </Button>

                          {isEnabled ? (
                            <Button
                              onClick={() => this.handleRemoveMod(mod.addon.id, mod.registryId)}
                              variant="danger"
                              size="sm"
                              title={t("title-remove-mod")}
                              className="flex-1 justify-center max-sm:min-h-10 max-sm:text-sm sm:flex-none"
                            >
                              {t("button-remove-mod")}
                            </Button>
                          ) : (
                            <Button
                              onClick={() => this.handleInstallMod(mod.addon.id, mod.registryId)}
                              variant="primary"
                              size="sm"
                              title={t("title-install-mod")}
                              className="flex-1 justify-center max-sm:min-h-10 max-sm:text-sm sm:flex-none"
                            >
                              {t("button-install-mod")}
                            </Button>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-2 border-t border-bmm-border/70 pt-2 text-xs leading-5 text-bmm-muted">
                          {modDescription && <p className="mb-2 text-bmm-ink">{modDescription}</p>}

                          {mod.addon.tags && mod.addon.tags.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1">
                              {mod.addon.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="neutral"
                                  style={getTagStyle(tagColorMap, tag)}
                                  className="px-1.5 py-0.5 text-[0.6875rem] leading-none shadow-none"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}

                          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                            {mod.addon.versions.length > 0 && (
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0">{t("label-selected-version")}:</span>

                                <Select
                                  value={selectedVersion}
                                  onChange={(e) =>
                                    this.handleVersionChange(
                                      mod.addon.id,
                                      mod.registryId,
                                      (e.target as HTMLSelectElement).value,
                                      isEnabled,
                                    )
                                  }
                                  compact
                                  className="h-7 w-36"
                                >
                                  {mod.addon.versions.map((v) => (
                                    <option key={v.distribution} value={v.distribution}>
                                      {v.distribution}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                            )}

                            <div>
                              ID: <span className="font-mono text-bmm-ink">{mod.addon.id}</span>
                            </div>

                            <div>
                              {t("label-registry")}: <span className="text-bmm-ink">{mod.registryUrl}</span>
                            </div>

                            {mod.addon.type && (
                              <div>
                                {t("label-type")}: <span className="text-bmm-ink">{mod.addon.type}</span>
                              </div>
                            )}

                            {mod.addon.repository && (
                              <div className="min-w-0">
                                {t("label-repository")}:{" "}
                                <a
                                  href={mod.addon.repository}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="break-all text-bmm-accent hover:text-bmm-accent-strong"
                                >
                                  {mod.addon.repository}
                                </a>
                              </div>
                            )}

                            {mod.addon.website && (
                              <div className="min-w-0">
                                {t("label-website")}:{" "}
                                <a
                                  href={mod.addon.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="break-all text-bmm-accent hover:text-bmm-accent-strong"
                                >
                                  {mod.addon.website}
                                </a>
                              </div>
                            )}

                            {mod.addon.discord && (
                              <div className="min-w-0">
                                {t("label-discord")}:{" "}
                                <a
                                  href={mod.addon.discord}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="break-all text-bmm-accent hover:text-bmm-accent-strong"
                                >
                                  {t("button-join-discord")}
                                </a>
                              </div>
                            )}
                          </div>

                          {isEnabled &&
                            (() => {
                              const loadEntry = this.state.loadStatus.get(uniqueId);

                              return (
                                <div className="mt-2 rounded-md border border-bmm-border bg-bmm-surface-muted px-2 py-1.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span>{t("label-load-status")}:</span>
                                    {this.renderLoadBadge(uniqueId)}
                                    {loadEntry?.loadType && (
                                      <span className="text-bmm-faint">{loadEntry.loadType}</span>
                                    )}
                                  </div>

                                  {loadEntry?.status === "error" && loadEntry.error && (
                                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-2 text-[0.6875rem] text-red-700">
                                      {loadEntry.error}
                                    </pre>
                                  )}

                                  {loadEntry?.postLoadError && (
                                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-2 text-[0.6875rem] text-red-700">
                                      {t("label-post-load-error")}: {loadEntry.postLoadError}
                                    </pre>
                                  )}
                                </div>
                              );
                            })()}
                        </div>
                      )}
                    </ListRow>
                  );
                })}
              </div>
            )}
          </List>
        </div>

        {/* Footer Info */}
        {filteredMods.length > 0 && (
          <div className="mt-3.5 text-center text-[0.8125rem] text-bmm-muted">
            {t("showing-x-of-y-mods", { x: filteredMods.length, y: totalCount })}
          </div>
        )}

        {/* Custom Extension Modal */}
        {showCustomExtensionModal && (
          <CustomExtensionModal
            onClose={this.handleCloseCustomExtensionModal}
            onExtensionAdded={this.handleCustomExtensionChanged}
          />
        )}
      </Page>
    );
  }
}
