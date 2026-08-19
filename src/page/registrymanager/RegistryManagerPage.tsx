import {Component} from "preact";
import {RegistryService} from "@/service/RegistryService";
import {RegistryDataService} from "@/service/RegistryDataService";
import {ModalStore} from "@/ui/store/ModalStore";
import type {CachedRegistryData, Registry, RegistryType} from "@/domain/Registry";
import {t} from "@/i18n/i18n";
import Alert from "@/component/ui/Alert";
import Badge from "@/component/ui/Badge";
import Button from "@/component/ui/Button";
import EmptyState from "@/component/ui/EmptyState";
import Icon from "@/component/ui/Icon";
import Input from "@/component/ui/Input";
import ListRow from "@/component/ui/ListRow";
import Page from "@/component/ui/Page";
import PageHeader from "@/component/ui/PageHeader";
import Panel from "@/component/ui/Panel";
import Select from "@/component/ui/Select";
import Toolbar from "@/component/ui/Toolbar";
import ToolbarPrimary from "@/component/ui/ToolbarPrimary";

interface RegistryManagerState {
  registries: Registry[];
  cachedData: Map<string, CachedRegistryData>;
  fetchingIds: Set<string>;
  newUrl: string;
  newType: RegistryType;
  editingId: string | null;
  editingUrl: string;
  editingType: RegistryType;
  error: string | null;
}

export default class RegistryManagerPage extends Component<{}, RegistryManagerState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      registries: RegistryService.getAll(),
      cachedData: new Map(),
      fetchingIds: new Set(),
      newUrl: '',
      newType: 'fusam',
      editingId: null,
      editingUrl: '',
      editingType: 'fusam',
      error: null,
    };
  }

  componentDidMount() {
    this.loadRegistries();
    this.loadCachedData();
  }

  loadRegistries = () => {
    this.setState({
      registries: RegistryService.getAll(),
    });
  };

  loadCachedData = () => {
    const allCached = RegistryDataService.getAllCached();
    const cachedMap = new Map<string, CachedRegistryData>();
    allCached.forEach(cached => {
      cachedMap.set(cached.registryId, cached);
    });
    this.setState({cachedData: cachedMap});
  };

  handleNewUrlChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    this.setState({newUrl: target.value, error: null});
  };

  handleNewTypeChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    this.setState({newType: target.value as RegistryType, error: null});
  };

  handleEditUrlChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    this.setState({editingUrl: target.value, error: null});
  };

  handleEditTypeChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    this.setState({editingType: target.value as RegistryType, error: null});
  };

  handleAdd = () => {
    const {newUrl, newType} = this.state;

    if (!newUrl.trim()) {
      this.setState({error: t('error-enter-url')});
      return;
    }

    const registry = RegistryService.add(newUrl, newType);

    if (registry) {
      this.setState({
        newUrl: '',
        newType: 'fusam',
        error: null,
      });
      this.loadRegistries();
    } else {
      this.setState({error: t('error-add-registry-failed')});
    }
  };

  handleEdit = (registry: Registry) => {
    this.setState({
      editingId: registry.id,
      editingUrl: registry.url,
      editingType: registry.type,
      error: null,
    });
  };

  handleSaveEdit = () => {
    const {editingId, editingUrl, editingType} = this.state;

    if (!editingId) return;

    if (!editingUrl.trim()) {
      this.setState({error: t('error-enter-url')});
      return;
    }

    const registry = RegistryService.update(editingId, editingUrl, editingType);

    if (registry) {
      this.setState({
        editingId: null,
        editingUrl: '',
        editingType: 'fusam',
        error: null,
      });
      this.loadRegistries();
    } else {
      this.setState({error: t('error-update-registry-failed')});
    }
  };

  handleCancelEdit = () => {
    this.setState({
      editingId: null,
      editingUrl: '',
      editingType: 'fusam',
      error: null,
    });
  };

  handleDelete = async (id: string) => {
    if (await ModalStore.confirm(t('confirm-delete-registry'), {confirmLabel: t('button-delete')})) {
      const success = RegistryService.delete(id);

      if (success) {
        // Also clear cached data
        RegistryDataService.clearCache(id);
        this.loadRegistries();
        this.loadCachedData();
      } else {
        this.setState({error: t('error-delete-registry-failed')});
      }
    }
  };

  handleFetchRegistry = async (registry: Registry) => {
    const {fetchingIds} = this.state;

    // Prevent multiple simultaneous fetches
    if (fetchingIds.has(registry.id)) {
      return;
    }

    // Add to fetching set
    fetchingIds.add(registry.id);
    this.setState({fetchingIds: new Set(fetchingIds), error: null});

    try {
      const cachedData = await RegistryDataService.fetchRegistry(registry);

      // Update cached data
      this.loadCachedData();

      // Remove from fetching set
      fetchingIds.delete(registry.id);
      this.setState({fetchingIds: new Set(fetchingIds)});

      if (cachedData.error) {
        this.setState({error: t('error-fetch-registry-failed', {error: cachedData.error})});
      }
    } catch (error) {
      console.error('Error fetching registry:', error);
      fetchingIds.delete(registry.id);
      this.setState({
        fetchingIds: new Set(fetchingIds),
        error: t('error-fetch-registry-failed', {error: error instanceof Error ? error.message : 'Unknown error'})
      });
    }
  };

  handleFetchAllRegistries = async () => {
    const {registries} = this.state;

    if (registries.length === 0) {
      this.setState({error: t('error-no-registries-to-fetch')});
      return;
    }

    // Mark all as fetching
    const fetchingIds = new Set(registries.map(r => r.id));
    this.setState({fetchingIds, error: null});

    try {
      await RegistryDataService.fetchAllRegistries(registries);

      // Update cached data
      this.loadCachedData();

      // Clear fetching state
      this.setState({fetchingIds: new Set()});
    } catch (error) {
      console.error('Error fetching registries:', error);
      this.setState({
        fetchingIds: new Set(),
        error: t('error-fetch-registries-failed', {error: error instanceof Error ? error.message : 'Unknown error'})
      });
    }
  };

  render() {
    const {
      registries,
      cachedData,
      fetchingIds,
      newUrl,
      newType,
      editingId,
      editingUrl,
      editingType,
      error
    } = this.state;

    return (
      <Page size="narrow">
        <PageHeader title={t('title-registry-manager')}/>

        {/* Error Message */}
        {error && (
          <Alert>
            {error}
          </Alert>
        )}

        {/* Add New Registry */}
        <Panel title={t('title-add-new-registry')} body>
          <Toolbar inline>
            <ToolbarPrimary>
              <Input
                type="text"
                value={newUrl}
                onInput={this.handleNewUrlChange}
                placeholder={t('placeholder-registry-url')}
              />
            </ToolbarPrimary>
            <Select
              value={newType}
              onChange={this.handleNewTypeChange}
              className="w-auto min-w-32"
            >
              <option value="fusam">{t('registry-type-fusam')}</option>
              <option value="aurora">{t('registry-type-aurora')}</option>
            </Select>
            <Button
              onClick={this.handleAdd}
              variant="primary"
            >
              {t('button-add')}
            </Button>
          </Toolbar>
        </Panel>

        {/* Registry List */}
        <Panel
          list
          title={t('title-registered-registries')}
          actions={<Button
            onClick={this.handleFetchAllRegistries}
            disabled={registries.length === 0 || fetchingIds.size > 0}
            variant="primary"
            title={t('button-fetch-all')}
          >
            {fetchingIds.size > 0 ? (
              <>
                <Icon name="refresh" spin/>
                {t('button-fetching')}
              </>
            ) : (
              <>
                <Icon name="refresh"/>
                {t('button-fetch-all')}
              </>
            )}
          </Button>}
        >
          {registries.length === 0 ? (
            <EmptyState title={t('message-no-registries')}/>
          ) : (
            <div>
              {registries.map((registry) => (
                <ListRow key={registry.id}>
                  {editingId === registry.id ? (
                    // Edit Mode
                    <Toolbar inline>
                      <ToolbarPrimary>
                        <Input
                          type="text"
                          value={editingUrl}
                          onInput={this.handleEditUrlChange}
                        />
                      </ToolbarPrimary>
                      <Select
                        value={editingType}
                        onChange={this.handleEditTypeChange}
                        className="w-auto min-w-32"
                      >
                        <option value="fusam">{t('registry-type-fusam')}</option>
                        <option value="aurora">{t('registry-type-aurora')}</option>
                      </Select>
                      <Button
                        onClick={this.handleSaveEdit}
                        variant="primary"
                      >
                        {t('button-save')}
                      </Button>
                      <Button
                        onClick={this.handleCancelEdit}
                        variant="neutral"
                      >
                        {t('button-cancel')}
                      </Button>
                    </Toolbar>
                  ) : (
                    // View Mode
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div
                            className="break-all text-[0.96875rem] font-bold leading-snug text-bmm-ink">{registry.url}</div>
                          <Badge variant={registry.type === 'fusam' ? 'primary' : 'neutral'}>
                            {registry.type}
                          </Badge>
                        </div>
                        <div className="mt-1 text-[0.8125rem] text-bmm-muted">
                          {t('label-added')}: {new Date(registry.createdAt).toLocaleString()}
                          {registry.updatedAt !== registry.createdAt && (
                            <span className="ml-2">
                              | {t('label-updated')}: {new Date(registry.updatedAt).toLocaleString()}
                            </span>
                          )}
                        </div>

                        {/* Cache Information */}
                        {(() => {
                          const cached = cachedData.get(registry.id);
                          if (cached) {
                            return (
                              <div
                                className="mt-2.5 rounded-lg border border-bmm-border bg-bmm-surface-raised px-3 py-2.5 shadow-bmm-control">
                                <div className="flex items-center gap-4 text-xs flex-wrap">
                                  {cached.error ? (
                                    <span className="font-bold text-red-700">
                                      {t('label-error')}: {cached.error}
                                    </span>
                                  ) : (
                                    <>
                                      <span className="font-bold text-emerald-700">
                                        {cached.modCount} {cached.modCount !== 1 ? t('label-mods') : t('label-mod')}
                                      </span>
                                      <span className="text-[0.8125rem] text-bmm-muted">
                                        {t('label-cached')}: {RegistryDataService.formatCacheAge(cached)}
                                      </span>
                                      <span className="text-[0.8125rem] text-bmm-muted">
                                        ({new Date(cached.fetchedAt).toLocaleString()})
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="flex flex-wrap gap-2 sm:ml-4 sm:flex-col">
                        <Button
                          onClick={() => this.handleFetchRegistry(registry)}
                          disabled={fetchingIds.has(registry.id)}
                          variant="neutral"
                          size="sm"
                          title={t('title-fetch-registry')}
                        >
                          {fetchingIds.has(registry.id) ? (
                            <>
                              <Icon name="refresh" spin/>
                              {t('button-fetching')}
                            </>
                          ) : (
                            <>
                              <Icon name="refresh"/>
                              {t('button-fetch')}
                            </>
                          )}
                        </Button>
                        {!registry.isPreset && <div className="flex gap-2">
                          <Button
                            onClick={() => this.handleEdit(registry)}
                            variant="primary"
                            size="sm"
                            title={t('title-edit-registry')}
                          >
                            {t('button-edit')}
                          </Button>
                          <Button
                            onClick={() => this.handleDelete(registry.id)}
                            variant="danger"
                            size="sm"
                            title={t('title-delete-registry')}
                          >
                            {t('button-delete')}
                          </Button>
                        </div>}
                      </div>
                    </div>
                  )}
                </ListRow>
              ))}
            </div>
          )}
        </Panel>

        {/* Registry Count */}
        {registries.length > 0 && (
          <div className="mt-3.5 text-center text-[0.8125rem] text-bmm-muted">
            {t('message-total-registries', {count: registries.length.toString()})}
          </div>
        )}
      </Page>
    );
  }
}
