import {Component} from "preact";
import {t} from "@/i18n/i18n.ts";
import cn from "@/util/cn.ts";
import Icon from "@/component/ui/Icon.tsx";
import Badge from "@/component/ui/Badge.tsx";
import {ModLoaderService} from "@/service/ModLoaderService.ts";
import {ModCacheService} from "@/service/ModCacheService.ts";
import {LoaderVersion} from "@/infrastructure/bridge/LoaderVersion";
import {SdkStateService} from "@/service/SdkStateService.ts";
import {FusamStateService} from "@/service/FusamStateService.ts";
import {BcGameState} from "@/service/BcGameState.ts";
import type {ModLoadProgress, ModLoadStatus} from "@/domain/ModLoad";
import {formatDuration} from "@/util/format.ts";

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
  outdatedModKeys: string[];
  sdkHijacked: boolean;       // BC's SDK initialized before ours with mods already registered
  sdkHijackedCount: number;
  fusamConflict: boolean;     // a genuine FUSAM loader is also present on the page
  dismissed: boolean;
  loggedIn: boolean;          // BC account login has completed
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
  private unsubscribeFusamState?: () => void;
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
      outdatedModKeys: ModCacheService.getOutdatedModKeys(),
      sdkHijacked: SdkStateService.isHijacked(),
      sdkHijackedCount: SdkStateService.getHijackInfo()?.registeredMods.length ?? 0,
      fusamConflict: FusamStateService.isConflict(),
      dismissed: false,
      loggedIn: BcGameState.isLoggedIn(),
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
      const outdatedModKeys = ModCacheService.getOutdatedModKeys();
      if (modsOutdated) {
        // Bring the window back so a stale mod detected after the initial load
        // still reaches the user.
        this.clearHideTimer();
        this.setState({modsOutdated, modsOutdatedCount, outdatedModKeys, dismissed: false});
      } else {
        this.setState({modsOutdated, modsOutdatedCount, outdatedModKeys});
      }
    });

    this.unsubscribeSdkState = SdkStateService.subscribe(info => {
      if (info) {
        this.clearHideTimer();
        this.setState({sdkHijacked: true, sdkHijackedCount: info.registeredMods.length, dismissed: false});
      }
    });

    this.unsubscribeFusamState = FusamStateService.subscribe(conflict => {
      if (conflict) {
        this.clearHideTimer();
        this.setState({fusamConflict: true, dismissed: false});
      }
    });

    this.scheduleAutoHide(this.state.progress.finished);

    // Mods load as soon as BC creates Player, but the startup window stays
    // visible until the account login is complete.
    this.screenTimer = window.setInterval(() => {
      const loggedIn = BcGameState.isLoggedIn();
      if (loggedIn !== this.state.loggedIn) {
        this.setState({loggedIn});
        if (loggedIn) {
          this.scheduleAutoHide(this.state.progress.finished, loggedIn);
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
    this.unsubscribeFusamState?.();
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
    return LoaderVersion.isOutdated() || ModCacheService.isAnyOutdated() || SdkStateService.isHijacked() || FusamStateService.isConflict();
  }

  render() {
    const {progress, outdated, modsOutdated, modsOutdatedCount, outdatedModKeys, sdkHijacked, sdkHijackedCount, fusamConflict, dismissed} = this.state;
    if (dismissed) {
      return null;
    }
    // Nothing worth showing: no mods to load and everything is current.
    if (progress.total === 0 && !outdated && !modsOutdated && !sdkHijacked && !fusamConflict) {
      return null;
    }

    const percent = progress.total > 0
      ? Math.round((progress.settled / progress.total) * 100)
      : (outdated || modsOutdated || fusamConflict ? 100 : 0);
    const outdatedModKeySet = new Set(outdatedModKeys);

    return (
      <div className="fixed bottom-6 right-6 z-[60] w-[22rem] max-w-[calc(100vw-3rem)]">
        <div
          className="overflow-hidden rounded-lg border border-bmm-border bg-bmm-surface shadow-bmm-panel ring-1 ring-slate-950/5">
          <div
            className="flex items-center justify-between gap-3 border-b border-bmm-border bg-bmm-surface-raised px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {!progress.finished && <Icon name="refresh" spin className="text-bmm-accent"/>}
              <h2 className="m-0 truncate text-sm font-bold text-bmm-ink">{t('loading-title')}</h2>
            </div>
            <button
              type="button"
              onClick={this.handleClose}
              title={t('button-close')}
              aria-label={t('button-close')}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-lg leading-none text-bmm-faint transition-colors hover:bg-bmm-accent-soft hover:text-bmm-accent-strong"
            >
              ×
            </button>
          </div>

          <div className="px-4 py-3">
            {outdated && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="m-0 text-[0.8125rem] font-bold text-amber-800">{t('loading-outdated-title')}</p>
                <p className="m-0 mt-1 text-xs leading-5 text-amber-700">{t('loading-outdated-detail')}</p>
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100"
                >
                  <Icon name="refresh"/>
                  {t('loading-button-reload')}
                </button>
              </div>
            )}

            {modsOutdated && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="m-0 text-[0.8125rem] font-bold text-amber-800">{t('loading-mods-outdated-title')}</p>
                <p className="m-0 mt-1 text-xs leading-5 text-amber-700">
                  {t('loading-mods-outdated-detail', {count: modsOutdatedCount})}
                </p>
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100"
                >
                  <Icon name="refresh"/>
                  {t('loading-button-reload')}
                </button>
              </div>
            )}

            {fusamConflict && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="m-0 text-[0.8125rem] font-bold text-amber-800">{t('loading-fusam-conflict-title')}</p>
                <p className="m-0 mt-1 text-xs leading-5 text-amber-700">{t('loading-fusam-conflict-detail')}</p>
              </div>
            )}

            {false && sdkHijacked && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="m-0 text-[0.8125rem] font-bold text-amber-800">{t('loading-sdk-hijacked-title')}</p>
                <p className="m-0 mt-1 text-xs leading-5 text-amber-700">
                  {t('loading-sdk-hijacked-detail', {count: sdkHijackedCount})}
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
                  className={cn(
                    'h-full rounded-full transition-[width] duration-300',
                    progress.errored > 0 ? 'bg-amber-400' : 'bg-bmm-accent',
                  )}
                  style={{width: `${percent}%`}}
                />
              </div>
            )}

            {progress.total > 0 && (
              <ul className="m-0 mt-2 flex max-h-52 list-none flex-col gap-0.5 overflow-y-auto p-0 pr-0.5">
                {[...progress.entries]
                  .sort((a, b) => {
                    const outdatedSort = Number(outdatedModKeySet.has(b.modKey)) - Number(outdatedModKeySet.has(a.modKey));
                    return outdatedSort || STATUS_SORT[a.status] - STATUS_SORT[b.status];
                  })
                  .map(entry => {
                    const modOutdated = outdatedModKeySet.has(entry.modKey);
                    const entryDetail = this.entryDetailText(entry, modOutdated);
                    return (
                    <li
                      key={entry.modKey}
                      title={entryDetail}
                      className={cn(
                        'grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-x-1.5 rounded px-1.5 py-1 text-[0.6875rem] leading-4 hover:bg-bmm-surface-muted',
                        modOutdated && 'border border-amber-200/70 bg-amber-50/80 px-[5px] py-[3px] hover:bg-amber-50',
                      )}
                    >
                      <span className={cn(
                        'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full',
                        modOutdated ? 'bg-amber-500' : STATUS_DOT[entry.status],
                        entry.status === 'loading' && 'animate-pulse',
                      )}/>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate',
                              entry.status === 'loaded' ? 'text-bmm-muted' : 'text-bmm-ink',
                              entry.status === 'error' && 'font-semibold text-red-700',
                            )}
                            title={entryDetail}
                          >{entry.name}</span>
                          {modOutdated && (
                            <Badge
                              variant="warning"
                              className="max-w-[5.75rem] shrink-0 overflow-hidden text-ellipsis px-1.5 py-0 text-[0.625rem]"
                              title={entryDetail}
                            >
                              {t('loading-mod-outdated-badge')}
                            </Badge>
                          )}
                        </div>
                        {entry.status === 'error' && entry.error && (
                          <div className="mt-0.5 truncate text-red-500" title={entryDetail}>
                            {entry.error}
                          </div>
                        )}
                      </div>
                      {entry.durationMs !== undefined && entry.status !== 'error' && (
                        <span className="self-start tabular-nums text-bmm-faint">
                          {formatDuration(entry.durationMs)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  private scheduleAutoHide(finished: boolean, loggedIn = this.state.loggedIn || BcGameState.isLoggedIn()) {
    if (finished && loggedIn && this.hideTimer === null && !this.anyOutdated()) {
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
    const {progress, outdated, modsOutdated, fusamConflict} = this.state;
    if (progress.waitingForGame) {
      return t('loading-waiting-game');
    }
    if (progress.total === 0) {
      if (outdated) {
        return t('loading-outdated-title');
      }
      if (modsOutdated) {
        return t('loading-mods-outdated-title');
      }
      if (fusamConflict) {
        return t('loading-fusam-conflict-title');
      }
      return t('loading-complete');
    }
    if (progress.finished) {
      const base = progress.errored > 0
        ? t('loading-complete-errors', {count: progress.errored})
        : t('loading-complete');
      return progress.totalDurationMs !== undefined
        ? `${base} · ${formatDuration(progress.totalDurationMs)}`
        : base;
    }
    return t('loading-in-progress');
  }

  private entryDetailText(entry: ModLoadProgress['entries'][number], modOutdated: boolean): string {
    const lines = [
      entry.name,
      `${t('label-load-status')}: ${t(`loading-status-${entry.status}`)}`,
    ];

    if (entry.distribution) {
      lines.push(`${t('label-selected-version')}: ${entry.distribution}`);
    }
    if (entry.loadType) {
      lines.push(`${t('label-type')}: ${entry.loadType}`);
    }
    if (entry.durationMs !== undefined) {
      lines.push(`${t('label-load-duration')}: ${formatDuration(entry.durationMs)}`);
    }
    if (modOutdated) {
      lines.push(t('loading-mod-outdated-detail'));
    }
    if (entry.error) {
      lines.push(`${t('label-error')}: ${entry.error}`);
    }
    if (entry.postLoadError) {
      lines.push(`${t('label-post-load-error')}: ${entry.postLoadError}`);
    }

    return lines.join('\n');
  }

}
