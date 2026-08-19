import {Component} from "preact";
import {Logger, type LogEntry, type LogLevel} from "@/infrastructure/logging/Logger";
import {LogService} from "@/service/LogService";
import {ModalStore} from "@/ui/store/ModalStore";
import {t} from "@/i18n/i18n";
import {formatData} from "@/util/format.ts";
import Badge, {type BadgeVariant} from "@/component/ui/Badge";
import Button from "@/component/ui/Button";
import EmptyState from "@/component/ui/EmptyState";
import Icon from "@/component/ui/Icon";
import Input from "@/component/ui/Input";
import ListRow from "@/component/ui/ListRow";
import Page from "@/component/ui/Page";
import PageHeader from "@/component/ui/PageHeader";
import Panel from "@/component/ui/Panel";
import Select from "@/component/ui/Select";
import StatCard from "@/component/ui/StatCard";
import StatsGrid from "@/component/ui/StatsGrid";
import Toolbar from "@/component/ui/Toolbar";

interface LogManagerState {
  logs: LogEntry[];
  filter: LogLevel | 'all';
  searchQuery: string;
  autoRefresh: boolean;
  debugMethods: string[];
  isDownloading: boolean;
}

export default class LogManagerPage extends Component<{}, LogManagerState> {
  private refreshInterval: number | null = null;

  constructor(props: {}) {
    super(props);
    this.state = {
      logs: [],
      filter: 'all',
      searchQuery: '',
      autoRefresh: false,
      debugMethods: [],
      isDownloading: false,
    };
  }

  componentDidMount() {
    this.loadLogs();
    this.loadDebugMethods();
  }

  componentWillUnmount() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  loadLogs = () => {
    const logs = Logger.getAllLogs();
    this.setState({logs});
  };

  loadDebugMethods = () => {
    const debugMethods = LogService.getDebugMethods();
    this.setState({debugMethods});
  };

  handleFilterChange = (filter: LogLevel | 'all') => {
    this.setState({filter});
  };

  handleSearchChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    this.setState({searchQuery: target.value});
  };

  handleAutoRefreshToggle = () => {
    const newAutoRefresh = !this.state.autoRefresh;
    this.setState({autoRefresh: newAutoRefresh});

    if (newAutoRefresh) {
      this.refreshInterval = window.setInterval(() => {
        this.loadLogs();
      }, 2000); // Refresh every 2 seconds
    } else {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
    }
  };

  handleClearLogs = async () => {
    if (await ModalStore.confirm(t('confirm-clear-logs'))) {
      Logger.clearLogs();
      this.loadLogs();
    }
  };

  handleDownloadCrashReport = async () => {
    this.setState({isDownloading: true});
    try {
      await LogService.downloadCrashReport();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Error downloading crash report:', errorMsg);
    } finally {
      this.setState({isDownloading: false});
    }
  };

  handleRefresh = () => {
    this.loadLogs();
    this.loadDebugMethods();
  };

  getFilteredLogs = (): LogEntry[] => {
    let filtered = this.state.logs;

    // Filter by level
    if (this.state.filter !== 'all') {
      filtered = filtered.filter(log => log.level === this.state.filter);
    }

    // Filter by search query
    if (this.state.searchQuery) {
      const query = this.state.searchQuery.toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(query) ||
        (log.data && JSON.stringify(log.data).toLowerCase().includes(query))
      );
    }

    return filtered;
  };

  formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  getLevelVariant = (level: LogLevel): BadgeVariant => {
    switch (level) {
      case 'DEBUG':
        return 'neutral';
      case 'INFO':
        return 'primary';
      case 'WARN':
        return 'warning';
      case 'ERROR':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  render() {
    const {filter, searchQuery, autoRefresh, debugMethods, isDownloading} = this.state;
    const filteredLogs = this.getFilteredLogs();
    const stats = Logger.getLogStats();

    return (
      <Page size="xl">
        {/* Header */}
        <PageHeader
          title={t('title-log-manager')}
          subtitle={t('subtitle-log-manager')}
        />

        {/* Stats */}
        <StatsGrid>
          <StatCard label={t('label-total-logs')} value={this.state.logs.length} variant="primary"/>
          <StatCard label={t('label-debug')} value={stats['DEBUG']}/>
          <StatCard label={t('label-info')} value={stats['INFO']} variant="primary"/>
          <StatCard label={t('label-warnings')} value={stats['WARN']} variant="warning"/>
          <StatCard label={t('label-errors')} value={stats['ERROR']} variant="danger"/>
        </StatsGrid>

        {/* Controls */}
        <Toolbar>
          <div className="flex flex-wrap gap-4 items-center">
            {/* Filter */}
            <div className="flex items-center gap-2">
              <span className="text-[0.8125rem] font-semibold text-bmm-muted">{t('label-filter')}:</span>
              <Select
                value={filter}
                onChange={(e) => this.handleFilterChange((e.target as HTMLSelectElement).value as LogLevel | 'all')}
                compact
              >
                <option value="all">{t('filter-all-levels')}</option>
                <option value={'DEBUG'}>{t('filter-debug')}</option>
                <option value={'INFO'}>{t('filter-info')}</option>
                <option value={'WARN'}>{t('filter-warnings')}</option>
                <option value={'ERROR'}>{t('filter-errors')}</option>
              </Select>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <Input
                type="text"
                placeholder={t('placeholder-search-logs')}
                value={searchQuery}
                onInput={this.handleSearchChange}
                compact
                className="w-full"
              />
            </div>

            {/* Auto Refresh */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={this.handleAutoRefreshToggle}
                className="h-4 w-4 accent-bmm-accent"
              />
              <span className="text-[0.8125rem] font-semibold text-bmm-muted">{t('label-auto-refresh')}</span>
            </label>

            {/* Buttons */}
            <Button
              onClick={this.handleRefresh}
              variant="primary"
              size="sm"
              icon={<Icon name="refresh"/>}
            >
              {t('button-refresh')}
            </Button>

            <Button
              onClick={this.handleDownloadCrashReport}
              disabled={isDownloading}
              variant="neutral"
              size="sm"
            >
              {isDownloading ? (
                <>
                  <Icon name="download" spin/>
                  {t('button-downloading')}
                </>
              ) : (
                <>
                  <Icon name="download"/>
                  {t('button-download-crash-report')}
                </>
              )}
            </Button>

            <Button
              onClick={this.handleClearLogs}
              variant="danger"
              size="sm"
              icon={<Icon name="delete"/>}
            >
              {t('button-clear-logs')}
            </Button>
          </div>

          {/* Debug Methods Info */}
          {debugMethods.length > 0 && (
            <div className="mt-4 border-t border-bmm-border pt-4">
              <div className="text-[0.8125rem] text-bmm-muted">
                <span
                  className="font-medium">{t('label-registered-debug-methods', {count: debugMethods.length.toString()})}:</span>
                <span className="ml-2">{debugMethods.join(', ')}</span>
              </div>
            </div>
          )}
        </Toolbar>

        {/* Logs List */}
        <Panel list title={t('label-logs-count', {count: filteredLogs.length.toString()})}>
          <div className="max-h-[600px] overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <EmptyState
                title={t('message-no-logs-found')}
                description={searchQuery || filter !== 'all'
                  ? t('message-adjust-filters')
                  : t('message-logs-will-appear')}
              />
            ) : (
              [...filteredLogs].reverse().map((log) => (
                <ListRow key={log.id}>
                  <div className="flex items-start gap-3">
                    {/* Level Badge */}
                    <Badge variant={this.getLevelVariant(log.level)}>
                      {log.level}
                    </Badge>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-bmm-muted">
                          {log.message}
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[0.8125rem] text-bmm-faint">
                          {this.formatTimestamp(log.timestamp)}
                        </div>
                      </div>

                      {/* Additional Data */}
                      {log.data && (
                        <div
                          className="mt-2.5 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-200 shadow-bmm-control">
                          <pre className="m-0">{formatData(log.data)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                </ListRow>
              ))
            )}
          </div>
        </Panel>
      </Page>
    );
  }
}
