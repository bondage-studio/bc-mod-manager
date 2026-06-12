import {Component} from "preact";
import {ModService} from "@/service/ModService";
import {ModLoaderService} from "@/service/ModLoaderService";
import type {ModConfig} from "@/domain/Mod";
import type {FusamAddon} from "@/domain/Registry";
import type {ModLoadEntry, ModLoadStatus} from "@/domain/ModLoad";
import i18n, {currentLanguage} from "@/i18n/i18n.ts";
import {formatDuration, formatInitial, formatLocalizedName, formatSearchText} from "@/util/format.ts";
import CustomExtensionModal from "@/component/CustomExtensionModal";
import Alert from "@/component/ui/Alert";
import Badge, {type BadgeVariant} from "@/component/ui/Badge";
import Button from "@/component/ui/Button";
import EmptyState from "@/component/ui/EmptyState";
import Icon from "@/component/ui/Icon";
import Input from "@/component/ui/Input";
import List from "@/component/ui/List";
import ListRow from "@/component/ui/ListRow";
import Page from "@/component/ui/Page";
import PageHeader from "@/component/ui/PageHeader";
import Select from "@/component/ui/Select";
import StatCard from "@/component/ui/StatCard";
import StatsGrid from "@/component/ui/StatsGrid";
import Toolbar from "@/component/ui/Toolbar";
import ToolbarPrimary from "@/component/ui/ToolbarPrimary";


const LOAD_STATUS_LABEL_KEY: Record<ModLoadStatus, string> = {
  pending: 'loading-status-pending',
  loading: 'loading-status-loading',
  loaded: 'loading-status-loaded',
  error: 'loading-status-error',
};

const LOAD_STATUS_VARIANT: Record<ModLoadStatus, BadgeVariant> = {
  pending: 'neutral',
  loading: 'primary',
  loaded: 'success',
  error: 'danger',
};

interface ModManagerState {
  availableMods: Array<{
    addon: FusamAddon;
    registryId: string;
    registryUrl: string;
    config: ModConfig | null;
  }>;
  filter: 'all' | 'enabled' | 'disabled';
  searchQuery: string;
  error: string | null;
  expandedModId: string | null;
  // Track selected versions for mods that aren't installed yet
  pendingVersions: Map<string, string>; // key: `${modId}_${registryId}`, value: version
  showCustomExtensionModal: boolean;
  // Actual load status per mod, keyed by `${modId}_${registryId}`.
  loadStatus: Map<string, ModLoadEntry>;
}

export default class ModManagerPage extends Component<{}, ModManagerState> {
  private unsubscribeLoadStatus?: () => void;

  constructor(props: {}) {
    super(props);
    this.state = {
      availableMods: [],
      filter: 'all',
      searchQuery: '',
      error: null,
      expandedModId: null,
      pendingVersions: new Map(),
      showCustomExtensionModal: false,
      loadStatus: new Map(),
    };
  }

  componentDidMount() {
    this.loadMods();
    // Keep the per-mod load status live so badges reflect the real outcome,
    // including mods still loading or that crashed after the manager opened.
    this.unsubscribeLoadStatus = ModLoaderService.subscribeProgress(progress => {
      const loadStatus = new Map<string, ModLoadEntry>();
      progress.entries.forEach(entry => loadStatus.set(entry.modKey, entry));
      this.setState({loadStatus});
    });
  }

  componentWillUnmount() {
    this.unsubscribeLoadStatus?.();
  }

  loadMods = () => {
    const availableMods = ModService.getAvailableMods();
    this.setState({availableMods});
  };

  handleInstallMod = (modId: string, registryId: string) => {
    const uniqueKey = `${modId}_${registryId}`;
    const config = ModService.getConfig(modId, registryId);

    if (!config) {
      // Get the selected version from pendingVersions or use default
      const selectedVersion = this.state.pendingVersions.get(uniqueKey);
      const mod = this.state.availableMods.find(
        m => m.addon.id === modId && m.registryId === registryId
      );

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
        this.setState({pendingVersions: newPendingVersions});
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
      this.setState({pendingVersions: newPendingVersions});
    }
  };

  handleRemoveMod = (modId: string, registryId: string) => {
    if (confirm('Are you sure you want to remove this mod?')) {
      const uniqueKey = `${modId}_${registryId}`;
      ModService.removeConfig(modId, registryId);

      // Clear pending version if exists
      const newPendingVersions = new Map(this.state.pendingVersions);
      newPendingVersions.delete(uniqueKey);
      this.setState({pendingVersions: newPendingVersions});

      this.loadMods();
    }
  };

  handleFilterChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    this.setState({filter: target.value as 'all' | 'enabled' | 'disabled'});
  };

  handleSearchChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    this.setState({searchQuery: target.value});
  };

  toggleExpanded = (modId: string) => {
    this.setState(prevState => ({
      expandedModId: prevState.expandedModId === modId ? null : modId,
    }));
  };

  handleOpenCustomExtensionModal = () => {
    this.setState({showCustomExtensionModal: true});
  };

  handleCloseCustomExtensionModal = () => {
    this.setState({showCustomExtensionModal: false});
  };

  handleCustomExtensionChanged = () => {
    // Reload mods when custom extensions are added/updated/deleted
    this.loadMods();
  };

  getFilteredMods = () => {
    const {availableMods, filter, searchQuery} = this.state;

    let filtered = availableMods;

    // Apply enabled/disabled filter
    if (filter === 'enabled') {
      filtered = filtered.filter(m => m.config?.enabled);
    } else if (filter === 'disabled') {
      filtered = filtered.filter(m => !m.config?.enabled);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m => {
        const localizedNames = typeof m.addon.name === 'string'
          ? [m.addon.name]
          : Object.values(m.addon.name);
        const searchableText = formatSearchText([
          ...localizedNames,
          m.addon.description,
          m.addon.author,
          m.addon.id,
          m.registryUrl,
          ...(m.addon.tags || []),
          ...m.addon.versions.map(version => version.distribution),
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
        <Badge variant="neutral" title={i18n('loading-status-not-loaded')}>
          {i18n('loading-status-not-loaded')}
        </Badge>
      );
    }

    const label = i18n(LOAD_STATUS_LABEL_KEY[entry.status]);
    const showDuration = entry.durationMs !== undefined
      && (entry.status === 'loaded' || entry.status === 'error');

    return (
      <Badge variant={LOAD_STATUS_VARIANT[entry.status]} title={entry.error || label}>
        {label}{showDuration ? ` · ${formatDuration(entry.durationMs!)}` : ''}
      </Badge>
    );
  };

  render() {
    const {error, expandedModId, showCustomExtensionModal} = this.state;
    const filteredMods = this.getFilteredMods();
    const enabledCount = ModService.getEnabledCount();
    const totalCount = this.state.availableMods.length;

    const loadEntries = Array.from(this.state.loadStatus.values());
    const loadedCount = loadEntries.filter(entry => entry.status === 'loaded').length;
    const failedCount = loadEntries.filter(entry => entry.status === 'error').length;

    return (
      <Page size="xl">
        <PageHeader
          title={i18n('title-mod-manager')}
          actions={<Button
            onClick={this.handleOpenCustomExtensionModal}
            variant="neutral"
          >
            + {i18n('button-manage-custom-extensions')}
          </Button>}
        />

        {/* Error Message */}
        {error && (
          <Alert>
            {error}
          </Alert>
        )}

        {/* Stats Bar */}
        <StatsGrid>
          <StatCard label={i18n('label-total-mods')} value={totalCount} variant="primary"/>
          <StatCard label={i18n('label-enabled-mods')} value={enabledCount} variant="success"/>
          <StatCard label={i18n('label-disabled-mods')} value={totalCount - enabledCount}/>
          <StatCard label={i18n('label-loaded-mods')} value={loadedCount} variant="success"/>
          {failedCount > 0 && (
            <StatCard label={i18n('label-failed-mods')} value={failedCount} variant="danger"/>
          )}
        </StatsGrid>

        {/* Filters and Search */}
        <Toolbar>
          <ToolbarPrimary>
            <Input
              type="text"
              placeholder={i18n('placeholder-search-mods')}
              value={this.state.searchQuery}
              onInput={this.handleSearchChange}
            />
          </ToolbarPrimary>
          <Select
            value={this.state.filter}
            onChange={this.handleFilterChange}
            className="w-auto min-w-40"
          >
            <option value="all">{i18n('filter-all-mods')}</option>
            <option value="enabled">{i18n('filter-enabled-only')}</option>
            <option value="disabled">{i18n('filter-disabled-only')}</option>
          </Select>
        </Toolbar>

        {/* Mod List */}
        <List>
          {filteredMods.length === 0 ? (
            totalCount === 0 ? (
              <EmptyState
                title={i18n('no-mods-available')}
                description={i18n('no-mods-available-detail')}
              />
            ) : (
              <EmptyState title={i18n('no-mods-match-search')}/>
            )
          ) : (
            <div>
              {filteredMods.map((mod) => {
                const isEnabled = mod.config?.enabled || false;
                const uniqueId = `${mod.addon.id}_${mod.registryId}`;
                const modName = formatLocalizedName(mod.addon.name, currentLanguage());
                const modInitial = formatInitial(modName);

                // Get selected version: from config if installed, from pendingVersions if not, or default
                const selectedVersion = isEnabled
                  ? (mod.config?.selectedVersion || mod.addon.versions[0]?.distribution || '')
                  : (this.state.pendingVersions.get(uniqueId) || mod.addon.versions[0]?.distribution || '');

                const isExpanded = expandedModId === uniqueId;
                const categoryTags = mod.addon.tags?.slice(0, 3) || [];
                const authorLabel = mod.addon.author ? `by ${mod.addon.author}` : '';

                return (
                  <ListRow key={uniqueId} className="px-3 py-2">
                    <div className="grid gap-2 sm:grid-cols-[2rem_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-bmm-border bg-bmm-surface-raised text-xs font-bold text-bmm-muted">
                        {mod.addon.icon ? (
                          <img
                            src={mod.addon.icon}
                            alt=""
                            className="h-6 w-6 rounded object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          modInitial
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                          <h3 className="truncate text-sm font-bold leading-5 text-bmm-ink">
                            {modName}
                          </h3>

                          {authorLabel && (
                            <>
                              <span className="shrink-0 text-xs text-bmm-faint">-</span>
                              <span className="shrink-0 text-xs text-bmm-faint">
                                {authorLabel}
                              </span>
                            </>
                          )}

                          {categoryTags.length > 0 && (
                            <>
                              <span className="shrink-0 text-xs text-bmm-faint">-</span>

                              <div className="flex min-w-0 shrink items-center gap-1 overflow-hidden">
                                {categoryTags.map(tag => (
                                  <Badge
                                    key={tag}
                                    variant="neutral"
                                    className="shrink-0 px-1.5 py-0.5 text-[0.6875rem] leading-none"
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
                                className="px-1.5 py-0.5 text-[0.6875rem] leading-none"
                              >
                                {i18n('label-installed')}
                              </Badge>
                              {this.renderLoadBadge(uniqueId)}
                            </div>
                          )}
                        </div>

                        {mod.addon.description && (
                          <p className="mt-0.5 truncate text-xs leading-4 text-bmm-muted">
                            {mod.addon.description}
                          </p>
                        )}
                      </div>

                      <Button
                        onClick={() => this.toggleExpanded(uniqueId)}
                        variant="ghost"
                        size="sm"
                        icon={
                          <Icon
                            name="chevron"
                            className={isExpanded ? '-rotate-90' : 'rotate-90'}
                          />
                        }
                        className="justify-start sm:justify-center"
                      >
                        {isExpanded ? i18n('button-less') : i18n('button-more')}
                      </Button>

                      {isEnabled ? (
                        <Button
                          onClick={() => this.handleRemoveMod(mod.addon.id, mod.registryId)}
                          variant="danger"
                          size="sm"
                          title="Remove this mod"
                          className="justify-start sm:justify-center"
                        >
                          {i18n('button-remove-mod')}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => this.handleInstallMod(mod.addon.id, mod.registryId)}
                          variant="primary"
                          size="sm"
                          title="Install this mod"
                          className="justify-start sm:justify-center"
                        >
                          {i18n('button-install-mod')}
                        </Button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="mt-2 border-t border-bmm-border/70 pt-2 text-xs leading-5 text-bmm-muted">
                        {mod.addon.description && (
                          <p className="mb-2 text-bmm-ink">
                            {mod.addon.description}
                          </p>
                        )}

                        {mod.addon.tags && mod.addon.tags.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1">
                            {mod.addon.tags.map(tag => (
                              <Badge
                                key={tag}
                                variant="neutral"
                                className="px-1.5 py-0.5 text-[0.6875rem] leading-none"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                          <div>
                            ID: <span className="font-mono text-bmm-ink">{mod.addon.id}</span>
                          </div>

                          <div>
                            {i18n('label-registry')}: <span className="text-bmm-ink">{mod.registryUrl}</span>
                          </div>

                          {mod.addon.type && (
                            <div>
                              {i18n('label-type')}: <span className="text-bmm-ink">{mod.addon.type}</span>
                            </div>
                          )}

                          {mod.addon.repository && (
                            <div className="min-w-0">
                              {i18n('label-repository')}:{' '}
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
                              {i18n('label-website')}:{' '}
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
                              {i18n('label-discord')}:{' '}
                              <a
                                href={mod.addon.discord}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all text-bmm-accent hover:text-bmm-accent-strong"
                              >
                                {i18n('button-join-discord')}
                              </a>
                            </div>
                          )}
                        </div>

                        {isEnabled && (() => {
                          const loadEntry = this.state.loadStatus.get(uniqueId);

                          return (
                            <div className="mt-2 rounded-md border border-bmm-border bg-bmm-surface-muted px-2 py-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span>{i18n('label-load-status')}:</span>
                                {this.renderLoadBadge(uniqueId)}
                                {loadEntry?.loadType && (
                                  <span className="text-bmm-faint">
                                    {loadEntry.loadType}
                                  </span>
                                )}
                              </div>

                              {loadEntry?.status === 'error' && loadEntry.error && (
                                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-2 text-[0.6875rem] text-red-700">
                                  {loadEntry.error}
                                </pre>
                              )}

                              {loadEntry?.postLoadError && (
                                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-2 text-[0.6875rem] text-red-700">
                                  {i18n('label-post-load-error')}: {loadEntry.postLoadError}
                                </pre>
                              )}
                            </div>
                          );
                        })()}

                        {mod.addon.versions.length > 0 && (
                          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-bmm-border bg-bmm-surface-muted px-2 py-1.5">
                            <span className="text-xs font-semibold text-bmm-ink">
                              {i18n('label-selected-version')}
                            </span>

                            <Select
                              value={selectedVersion}
                              onChange={(e) =>
                                this.handleVersionChange(
                                  mod.addon.id,
                                  mod.registryId,
                                  (e.target as HTMLSelectElement).value,
                                  isEnabled
                                )
                              }
                              compact
                              className="w-full sm:w-40"
                            >
                              {mod.addon.versions.map(v => (
                                <option key={v.distribution} value={v.distribution}>
                                  {v.distribution}
                                </option>
                              ))}
                            </Select>

                            <span className="text-xs text-bmm-faint">
                              {selectedVersion || i18n('label-not-selected')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </ListRow>
                );
              })}
            </div>
          )}
        </List>

        {/* Footer Info */}
        {filteredMods.length > 0 && (
          <div className="mt-3.5 text-center text-[0.8125rem] text-bmm-muted">
            {i18n('showing-x-of-y-mods', {x: filteredMods.length, y: totalCount})}
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
