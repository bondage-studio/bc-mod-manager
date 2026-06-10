import '@/app.css'
import {Component} from "preact";
import i18n from "@/i18n/i18n.ts";
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

type PageType = 'mod-manager' | 'registry-manager' | 'log-viewer' | 'settings' | 'modal-test' | null;

interface AppState {
  showButton: boolean;
  menuOpen: boolean;
  currentPage: PageType;
}

export default class App extends Component<{}, AppState> {
  private screenTimer: number | null = null;

  constructor(props: {}) {
    super(props);
    this.state = {
      showButton: true,
      menuOpen: false,
      currentPage: null
    };
    window.bmm.app = this;
  }

  componentDidMount() {
    this.screenTimer = window.setInterval(() => {
      const targetState = typeof CurrentScreen == 'undefined' || CurrentScreen === "Preference" || CurrentScreen === "Login";
      if (this.state.showButton !== targetState) {
        this.setState({showButton: targetState});
      }
    }, 1000);
  }

  componentWillUnmount() {
    if (this.screenTimer) {
      clearInterval(this.screenTimer);
    }
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
  }

  closePage = () => {
    const wasModManager = this.state.currentPage === 'mod-manager';
    this.setState({currentPage: null});

    // If closing mod manager, check if we need to refresh
    if (wasModManager) {
      ModLoaderService.refreshIfNeeded();
    }
  }

  render() {
    const {menuOpen, currentPage} = this.state;
    const launcherItems: AppLauncherItem[] = [
      {
        id: 'mod-manager',
        label: i18n('button-mod-manager'),
        onClick: () => this.openPage('mod-manager'),
      },
      {
        id: 'registry-manager',
        label: i18n('button-registry-manager'),
        onClick: () => this.openPage('registry-manager'),
      },
      {
        id: 'log-viewer',
        label: i18n('button-log-viewer'),
        onClick: () => this.openPage('log-viewer'),
      },
      {
        id: 'settings',
        label: i18n('button-settings'),
        onClick: () => this.openPage('settings'),
      },
    ];

    return (
      <>
        {(this.state.showButton && !currentPage) && (
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
                title={i18n('button-close')}
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
