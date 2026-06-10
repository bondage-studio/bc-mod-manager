import { Component } from 'preact';
import { SdkCrashStore, type SdkCrashInfo } from '@/service/SdkCrashStore';
import SdkCrashDialog from '@/component/SdkCrashDialog';

interface State {
  crashes: SdkCrashInfo[];
}

export default class SdkCrashContainer extends Component<{}, State> {
  private unsubscribe?: () => void;

  state: State = { crashes: [] };

  componentDidMount() {
    this.unsubscribe = SdkCrashStore.subscribe(crashes => this.setState({ crashes }));
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    const { crashes } = this.state;
    if (crashes.length === 0) return null;
    // Show the oldest unacknowledged crash on top; the rest queue behind it.
    return <SdkCrashDialog crash={crashes[0]}/>;
  }
}