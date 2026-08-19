import '@/app.css'
import {Component} from "preact";
import {t} from "@/i18n/i18n.ts";
import RegistryManagerPage from "@/page/registrymanager/RegistryManagerPage.tsx";
import ModManagerPage from "@/page/modmanager/ModManagerPage.tsx";
import LogManagerPage from "@/page/logmanager/LogManagerPage.tsx";
import SettingsPage from "@/page/settings/SettingsPage.tsx";
import ModalContainer from "@/component/ModalContainer.tsx";
import ModLoadingWindow from "@/component/ModLoadingWindow.tsx";
import SdkCrashContainer from "@/component/SdkCrashContainer.tsx";
import {ModLoaderService} from "@/service/ModLoaderService.ts";
import AppLauncher, {type AppLauncherItem} from "@/component/AppLauncher.tsx";
import AppBackdrop from "@/component/ui/AppBackdrop.tsx";
import AppShell from "@/component/ui/AppShell.tsx";
import CloseButton from "@/component/ui/CloseButton.tsx";
import {BcGameState} from "@/service/BcGameState.ts";
import {PlatformBridge} from "@/infrastructure/bridge/PlatformBridge.ts";
import {PlatformApiService} from "@/service/PlatformApiService.ts";

/** A full-screen page BMM can open. */
export type PageName = 'mod-manager' | 'registry-manager' | 'log-viewer' | 'settings' | 'modal-test';

type PageType = PageName | null;

interface AppState {
  showButton: boolean;
  menuOpen: boolean;
  currentPage: PageType;
  // Host/API override of launcher visibility: null = auto-manage by screen.
  launcherOverride: boolean | null;
}

export default class App extends Component<{}, AppState> {
  private screenTimer: number | null = null;
  private unsubscribeLauncher?: () => void;

  constructor(props: {}) {
    super(props);
    this.state = {
      showButton: true,
      menuOpen: false,
      currentPage: null,
      launcherOverride: PlatformApiService.launcherVisibleOverride(),
    };
    window.bmm.app = this;
  }

  componentDidMount() {
    this.screenTimer = window.setInterval(() => {
      const targetState = BcGameState.isLoginScreen() || BcGameState.isPreferenceScreen();
      if (this.state.showButton !== targetState) {
        this.setState({showButton: targetState});
      }
    }, 1000);

    this.unsubscribeLauncher = PlatformApiService.subscribeLauncherOverride(
      (launcherOverride) => this.setState({launcherOverride}),
    );

    // Let the host open straight into a page on boot.
    const autoOpen = PlatformBridge.ui().autoOpen;
    if (autoOpen) {
      this.openPage(autoOpen);
    }
  }

  componentWillUnmount() {
    if (this.screenTimer) {
      clearInterval(this.screenTimer);
    }
    this.unsubscribeLauncher?.();
  }

  /** The active page, or null when closed to the launcher. */
  currentPage(): PageType {
    return this.state.currentPage;
  }

  toggleMenu = () => {
    this.setState({menuOpen: !this.state.menuOpen});
  }

  closeMenu = () => {
    this.setState({menuOpen: false});
  }

  openPage = (page: PageType) => {
    this.setState({
      currentPage: page,
      menuOpen: false
    });
    PlatformApiService.emit('pageChanged', {page});
  }

  closePage = () => {
    const wasModManager = this.state.currentPage === 'mod-manager';
    this.setState({currentPage: null});
    PlatformApiService.emit('pageChanged', {page: null});

    // If closing mod manager, check if we need to refresh
    if (wasModManager) {
      ModLoaderService.refreshIfNeeded();
    }
  }

  /**
   * Whether the floating launcher should be shown. A host can hide it outright
   * (it renders its own entry point); the public API can force it on/off; else
   * it auto-shows on the login/preference screens.
   */
  private launcherVisible(): boolean {
    if (PlatformBridge.ui().hideLauncher) {
      return false;
    }
    if (this.state.launcherOverride !== null) {
      return this.state.launcherOverride;
    }
    return this.state.showButton;
  }

  render() {
    const {menuOpen, currentPage} = this.state;
    const launcherItems: AppLauncherItem[] = [
      {
        id: 'mod-manager',
        label: t('button-mod-manager'),
        onClick: () => this.openPage('mod-manager'),
      },
      {
        id: 'registry-manager',
        label: t('button-registry-manager'),
        onClick: () => this.openPage('registry-manager'),
      },
      {
        id: 'log-viewer',
        label: t('button-log-viewer'),
        onClick: () => this.openPage('log-viewer'),
      },
      {
        id: 'settings',
        label: t('button-settings'),
        onClick: () => this.openPage('settings'),
      },
    ];

    return (
      <>
        {(this.launcherVisible() && !currentPage) && (
          <AppLauncher
            open={menuOpen}
            onToggle={this.toggleMenu}
            title="BC Mod Manager"
            items={launcherItems}
          />
        )}

        {currentPage && (
          <AppBackdrop>
            <AppShell>
              <CloseButton
                variant="app"
                onClick={this.closePage}
                title={t('button-close')}
              />

              {currentPage === 'mod-manager' && <ModManagerPage/>}
              {currentPage === 'registry-manager' && <RegistryManagerPage/>}
              {currentPage === 'log-viewer' && <LogManagerPage/>}
              {currentPage === 'settings' && <SettingsPage/>}
            </AppShell>
          </AppBackdrop>
        )}

        <ModalContainer/>
        <SdkCrashContainer/>

        <ModLoadingWindow/>
      </>
    )
  }
}
