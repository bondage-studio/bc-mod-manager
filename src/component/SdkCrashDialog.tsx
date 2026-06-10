import { Component } from 'preact';
import i18n from '@/i18n/i18n';
import type { SdkCrashInfo } from '@/service/SdkCrashStore';
import { SdkCrashStore } from '@/service/SdkCrashStore';
import Badge from '@/component/ui/Badge';
import Button from '@/component/ui/Button';
import CloseButton from '@/component/ui/CloseButton';
import Icon from '@/component/ui/Icon';
import ModalBackdrop from '@/component/ui/ModalBackdrop';

interface Props {
  crash: SdkCrashInfo;
}

interface State {
  stackExpanded: boolean;
}

export default class SdkCrashDialog extends Component<Props, State> {
  state: State = { stackExpanded: false };

  private handleDismiss = () => {
    SdkCrashStore.dismiss(this.props.crash.id);
  };

  private toggleStack = () => {
    this.setState(s => ({ stackExpanded: !s.stackExpanded }));
  };

  render() {
    const { crash } = this.props;
    const { stackExpanded } = this.state;

    return (
      <ModalBackdrop className="z-[65]">
        <div className="flex w-[min(92vw,540px)] max-h-[min(90vh,720px)] flex-col overflow-hidden rounded-lg border border-red-200 bg-bmm-surface shadow-bmm-panel ring-1 ring-slate-950/5">

          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-5 py-3.5">
            <div className="flex items-center gap-2 text-red-700">
              <span className="text-red-500 text-base leading-none">⚠</span>
              <h2 className="m-0 text-sm font-bold leading-tight">
                {i18n(crash.type === 'hook' ? 'crash-title-hook' : 'crash-title-patch')}
              </h2>
            </div>
            <CloseButton onClick={this.handleDismiss} variant="dialog"/>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* Mod + function meta */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-bmm-muted font-semibold">{i18n('crash-label-mod')}</span>
              <Badge variant="danger">{crash.mod}</Badge>
              <span className="text-bmm-muted font-semibold">{i18n('crash-label-function')}</span>
              <Badge variant="neutral">{crash.fn}</Badge>
            </div>

            {/* Error message */}
            <div>
              <p className="mb-1.5 text-xs font-bold text-bmm-muted uppercase tracking-wide">
                {i18n('crash-label-error')}
              </p>
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
                <p className="m-0 text-sm font-semibold text-red-800 break-words">{crash.errorMessage}</p>
              </div>
            </div>

            {/* Stack trace (collapsible) */}
            {crash.stackFrames.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={this.toggleStack}
                  className="flex items-center gap-1.5 text-xs font-bold text-bmm-muted hover:text-bmm-ink transition-colors"
                >
                  <Icon name="chevron" open={stackExpanded} className="text-[0.65rem]"/>
                  {i18n('crash-label-stack')}
                </button>
                {stackExpanded && (
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-bmm-border bg-bmm-surface-muted px-3.5 py-3 text-[0.6875rem] leading-5 text-bmm-muted whitespace-pre">
                    {crash.stackFrames.join('\n')}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t border-bmm-border bg-bmm-surface-raised px-5 py-3.5">
            <Button variant="danger" onClick={this.handleDismiss}>
              {i18n('crash-button-dismiss')}
            </Button>
          </div>
        </div>
      </ModalBackdrop>
    );
  }
}