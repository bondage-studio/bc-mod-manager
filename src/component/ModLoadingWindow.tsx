import {Component} from "preact";
import i18n from "@/i18n/i18n.ts";
import classNames from "@/component/ui/classNames.ts";
import Icon from "@/component/ui/Icon.tsx";
import {ModLoaderService} from "@/service/ModLoaderService.ts";
import {ModCacheService} from "@/service/ModCacheService.ts";
import {LoaderVersion} from "@/infrastructure/bridge/LoaderVersion";
import {SdkStateService} from "@/service/SdkStateService.ts";
import type {ModLoadProgress, ModLoadStatus} from "@/domain/ModLoad";
import {formatDuration} from "@/component/ui/format.ts";

// Auto-dismiss the window shortly after loading finishes (unless the build is
// outdated, in which case it stays so the user can act on the warning).
const AUTO_HIDE_DELAY = 1600;
// Hard backstop so a mod whose script never fires load/error can't pin the window open.
const SAFETY_HIDE_DELAY = 60000;

interface ModLoadingWindowState {
  progress: ModLoadProgress;
  outdated: boolean;          // the mod-loader build itself is stale
  modsOutdated: boolean;      // one or more cached mods are stale
  modsOutdatedCount: number;
  sdkHijacked: boolean;       // BC's SDK initialized before ours with mods already registered
  sdkHijackedCount: number;
  dismissed: boolean;
  onLoginScreen: boolean;     // still on the BC login screen
}

function isLoginScreen(): boolean {
  return typeof CurrentScreen === 'undefined' || CurrentScreen === 'Login';
}

const STATUS_DOT: Record<ModLoadStatus, string> = {
  pending: 'bg-bmm-border',
  loading: 'bg-bmm-accent',
  loaded: 'bg-emerald-500',
  error: 'bg-red-500',
};

// Lower number = shown first
const STATUS_SORT: Record<ModLoadStatus, number> = {
  error: 0,
  loading: 1,
  pending: 2,
  loaded: 3,
};

/**
 * Floating window that shows mod loading progress on startup, and warns when the
 * bootstrap userscript booted a stale (cached) build of the mod loader.
 */
export default class ModLoadingWindow extends Component<{}, ModLoadingWindowState> {
  private unsubscribeProgress?: () => void;
  private unsubscribeVersion?: () => void;
  private unsubscribeModCache?: () => void;
  private unsubscribeSdkState?: () => void;
  private hideTimer: number | null = null;
  private safetyTimer: number | null = null;
  private screenTimer: number | null = null;

  constructor(props: {}) {
    super(props);
    this.state = {
      progress: ModLoaderService.getProgress(),
      outdated: LoaderVersion.isOutdated(),
      modsOutdated: ModCacheService.isAnyOutdated(),
      modsOutdatedCount: ModCacheService.getOutdatedCount(),
      sdkHijacked: SdkStateService.isHijacked(),
      sdkHijackedCount: SdkStateService.getHijackInfo()?.registeredMods.length ?? 0,
      dismissed: false,
      onLoginScreen: isLoginScreen(),
    };
  }

  componentDidMount() {
    this.unsubscribeProgress = ModLoaderService.subscribeProgress(progress => {
      this.setState({progress});
      this.scheduleAutoHide(progress.finished);
    });

    this.unsubscribeVersion = LoaderVersion.subscribe(() => {
      const outdated = LoaderVersion.isOutdated();
      if (outdated) {
        // Keep (or bring back) the window so the warning is always seen, even if the
        // stale build was detected after the progress window had auto-dismissed.
        this.clearHideTimer();
        this.setState({outdated, dismissed: false});
      } else {
        this.setState({outdated});
      }
    });

    this.unsubscribeModCache = ModCacheService.subscribe(() => {
      const modsOutdated = ModCacheService.isAnyOutdated();
      const modsOutdatedCount = ModCacheService.getOutdatedCount();
      if (modsOutdated) {
        // Bring the window back so a stale mod detected after the initial load
        // still reaches the user.
        this.clearHideTimer();
        this.setState({modsOutdated, modsOutdatedCount, dismissed: false});
      } else {
        this.setState({modsOutdated, modsOutdatedCount});
      }
    });

    this.unsubscribeSdkState = SdkStateService.subscribe(info => {
      if (info) {
        this.clearHideTimer();
        this.setState({sdkHijacked: true, sdkHijackedCount: info.registeredMods.length, dismissed: false});
      }
    });

    this.scheduleAutoHide(this.state.progress.finished);

    // Poll CurrentScreen so we can defer auto-hide until the player has left
    // the login screen.
    this.screenTimer = window.setInterval(() => {
      const onLoginScreen = isLoginScreen();
      if (onLoginScreen !== this.state.onLoginScreen) {
        this.setState({onLoginScreen});
        if (!onLoginScreen) {
          this.scheduleAutoHide(this.state.progress.finished);
        }
      }
    }, 500);

    this.safetyTimer = window.setTimeout(() => {
      this.safetyTimer = null;
      if (!this.anyOutdated()) {
        this.setState({dismissed: true});
      }
    }, SAFETY_HIDE_DELAY);
  }

  componentWillUnmount() {
    this.unsubscribeProgress?.();
    this.unsubscribeVersion?.();
    this.unsubscribeModCache?.();
    this.unsubscribeSdkState?.();
    this.clearHideTimer();
    if (this.safetyTimer !== null) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    if (this.screenTimer !== null) {
      clearInterval(this.screenTimer);
      this.screenTimer = null;
    }
  }

  private anyOutdated(): boolean {
    return LoaderVersion.isOutdated() || ModCacheService.isAnyOutdated() || SdkStateService.isHijacked();
  }

  render() {
    const {progress, outdated, modsOutdated, modsOutdatedCount, sdkHijacked, sdkHijackedCount, dismissed} = this.state;
    if (dismissed) {
      return null;
    }
    // Nothing worth showing: no mods to load and everything is current.
    if (progress.total === 0 && !outdated && !modsOutdated && !sdkHijacked) {
      return null;
    }

    const percent = progress.total > 0
      ? Math.round((progress.settled / progress.total) * 100)
      : (outdated || modsOutdated ? 100 : 0);

    return (
      <div className="fixed bottom-6 right-6 z-[60] w-[20rem] max-w-[calc(100vw-3rem)]">
        <div
          className="overflow-hidden rounded-lg border border-bmm-border bg-bmm-surface shadow-bmm-panel ring-1 ring-slate-950/5">
          <div
            className="flex items-center justify-between gap-3 border-b border-bmm-border bg-bmm-surface-raised px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {!progress.finished && <Icon name="refresh" spin className="text-bmm-accent"/>}
              <h2 className="m-0 truncate text-sm font-bold text-bmm-ink">{i18n('loading-title')}</h2>
            </div>
            <button
              type="button"
              onClick={this.handleClose}
              title={i18n('button-close')}
              aria-label={i18n('button-close')}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-lg leading-none text-bmm-faint transition-colors hover:bg-bmm-accent-soft hover:text-bmm-accent-strong"
            >
              ×
            </button>
          </div>

          <div className="px-4 py-3">
            {outdated && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="m-0 text-[0.8125rem] font-bold text-amber-800">{i18n('loading-outdated-title')}</p>
                <p className="m-0 mt-1 text-xs leading-5 text-amber-700">{i18n('loading-outdated-detail')}</p>
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100"
                >
                  <Icon name="refresh"/>
                  {i18n('loading-button-reload')}
                </button>
              </div>
            )}

            {modsOutdated && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="m-0 text-[0.8125rem] font-bold text-amber-800">{i18n('loading-mods-outdated-title')}</p>
                <p className="m-0 mt-1 text-xs leading-5 text-amber-700">
                  {i18n('loading-mods-outdated-detail', {count: modsOutdatedCount})}
                </p>
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100"
                >
                  <Icon name="refresh"/>
                  {i18n('loading-button-reload')}
                </button>
              </div>
            )}

            {sdkHijacked && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="m-0 text-[0.8125rem] font-bold text-amber-800">{i18n('loading-sdk-hijacked-title')}</p>
                <p className="m-0 mt-1 text-xs leading-5 text-amber-700">
                  {i18n('loading-sdk-hijacked-detail', {count: sdkHijackedCount})}
                </p>
              </div>
            )}

            <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-bmm-muted">
              <span className="truncate">{this.statusText()}</span>
              {progress.total > 0 && (
                <span className="shrink-0 tabular-nums">{progress.settled}/{progress.total}</span>
              )}
            </div>

            {progress.total > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bmm-surface-muted">
                <div
                  className={classNames(
                    'h-full rounded-full transition-[width] duration-300',
                    progress.errored > 0 ? 'bg-amber-400' : 'bg-bmm-accent',
                  )}
                  style={{width: `${percent}%`}}
                />
              </div>
            )}

            {progress.total > 0 && (
              <ul className="m-0 mt-2 flex max-h-52 list-none flex-col overflow-y-auto p-0 pr-0.5">
                {[...progress.entries]
                  .sort((a, b) => STATUS_SORT[a.status] - STATUS_SORT[b.status])
                  .map(entry => (
                    <li
                      key={entry.modKey}
                      className="flex min-w-0 items-baseline gap-1.5 px-1 py-[2px] text-[0.6875rem] hover:bg-bmm-surface-muted rounded"
                    >
                      <span className={classNames(
                        'mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full',
                        STATUS_DOT[entry.status],
                        entry.status === 'loading' && 'animate-pulse',
                      )}/>
                      <span
                        className={classNames(
                          'min-w-0 truncate',
                          entry.status === 'loaded' ? 'text-bmm-muted' : 'text-bmm-ink',
                          entry.status === 'error' && 'font-semibold text-red-700',
                        )}
                        title={entry.name}
                      >{entry.name}</span>
                      {entry.status === 'error' && entry.error && (
                        <span className="shrink-0 truncate text-red-500" title={entry.error}>
                          — {entry.error}
                        </span>
                      )}
                      {entry.durationMs !== undefined && entry.status !== 'error' && (
                        <span className="ml-auto shrink-0 tabular-nums text-bmm-faint">
                          {formatDuration(entry.durationMs)}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  private scheduleAutoHide(finished: boolean) {
    if (finished && !this.state.onLoginScreen && this.hideTimer === null && !this.anyOutdated()) {
      this.hideTimer = window.setTimeout(() => {
        this.hideTimer = null;
        this.setState({dismissed: true});
      }, AUTO_HIDE_DELAY);
    }
  }

  private clearHideTimer() {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private handleClose = () => {
    this.clearHideTimer();
    this.setState({dismissed: true});
  };

  private handleReload = () => {
    window.location.reload();
  };

  private statusText(): string {
    const {progress, outdated, modsOutdated} = this.state;
    if (progress.waitingForGame) {
      return i18n('loading-waiting-game');
    }
    if (progress.total === 0) {
      if (outdated) {
        return i18n('loading-outdated-title');
      }
      if (modsOutdated) {
        return i18n('loading-mods-outdated-title');
      }
      return i18n('loading-complete');
    }
    if (progress.finished) {
      const base = progress.errored > 0
        ? i18n('loading-complete-errors', {count: progress.errored})
        : i18n('loading-complete');
      return progress.totalDurationMs !== undefined
        ? `${base} · ${formatDuration(progress.totalDurationMs)}`
        : base;
    }
    return i18n('loading-in-progress');
  }

}
