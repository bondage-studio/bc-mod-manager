import { Component } from 'preact';
import {t} from '@/i18n/i18n';
import type { SdkCrashInfo } from '@/service/SdkCrashStore';
import { SdkCrashStore } from '@/service/SdkCrashStore';
import { formatCrashReport, uploadToPastesDev } from '@/service/PasteService';
import Badge from '@/component/ui/Badge';
import Button from '@/component/ui/Button';
import CloseButton from '@/component/ui/CloseButton';
import Icon from '@/component/ui/Icon';
import ModalBackdrop from '@/component/ui/ModalBackdrop';

interface Props {
  crash: SdkCrashInfo;
  queueLength: number;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface State {
  stackExpanded: boolean;
  modsExpanded: boolean;
  uploadState: UploadState;
  pasteUrl: string;
}

export default class SdkCrashDialog extends Component<Props, State> {
  state: State = {
    stackExpanded: true,
    modsExpanded: false,
    uploadState: 'idle',
    pasteUrl: '',
  };

  componentDidUpdate(prevProps: Props) {
    if (prevProps.crash.id !== this.props.crash.id) {
      this.setState({ stackExpanded: true, modsExpanded: false, uploadState: 'idle', pasteUrl: '' });
    }
  }

  private handleDismiss = () => {
    SdkCrashStore.dismiss(this.props.crash.id);
  };

  private toggleStack = () => {
    this.setState(s => ({ stackExpanded: !s.stackExpanded }));
  };

  private toggleMods = () => {
    this.setState(s => ({ modsExpanded: !s.modsExpanded }));
  };

  private handleUpload = async () => {
    const { uploadState, pasteUrl } = this.state;

    if (uploadState === 'success' && pasteUrl) {
      await navigator.clipboard.writeText(pasteUrl).catch(() => {});
      return;
    }

    if (uploadState === 'uploading') return;

    this.setState({ uploadState: 'uploading' });
    try {
      const url = await uploadToPastesDev(formatCrashReport(this.props.crash));
      this.setState({ uploadState: 'success', pasteUrl: url });
    } catch {
      this.setState({ uploadState: 'error' });
    }
  };

  render() {
    const { crash, queueLength } = this.props;
    const { stackExpanded, modsExpanded, uploadState, pasteUrl } = this.state;

    return (
      <ModalBackdrop className="z-[65]">
        <div className="flex w-[min(92vw,720px)] max-h-[min(90vh,800px)] flex-col overflow-hidden rounded-lg border border-red-200 bg-bmm-surface shadow-bmm-panel ring-1 ring-slate-950/5 max-[720px]:h-dvh max-[720px]:max-h-dvh max-[720px]:w-dvw max-[720px]:max-w-dvw max-[720px]:rounded-none max-[720px]:border-0 max-[720px]:ring-0">

          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-5 py-3.5">
            <div className="flex items-center gap-2 text-red-700">
              <span className="text-red-500 text-base leading-none">⚠</span>
              <h2 className="m-0 text-sm font-bold leading-tight">
                {t(crash.type === 'hook' ? 'crash-title-hook' : 'crash-title-patch')}
              </h2>
              {queueLength > 1 && (
                <Badge variant="danger">{queueLength}</Badge>
              )}
            </div>
            <CloseButton onClick={this.handleDismiss} variant="dialog"/>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* Mod + function meta */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-bmm-muted font-semibold">{t('crash-label-mod')}</span>
              <Badge variant="danger">{crash.mod}</Badge>
              <span className="text-bmm-muted font-semibold">{t('crash-label-function')}</span>
              <Badge variant="neutral">{crash.fn}</Badge>
            </div>

            {/* Error message */}
            <div>
              <p className="mb-1.5 text-xs font-bold text-bmm-muted uppercase tracking-wide">
                {t('crash-label-error')}
              </p>
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
                <p className="m-0 text-sm font-semibold text-red-800 break-words">{crash.errorMessage}</p>
              </div>
            </div>

            {/* Stack trace (collapsible, default expanded) */}
            {crash.stackFrames.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={this.toggleStack}
                  className="flex items-center gap-1.5 text-xs font-bold text-bmm-muted hover:text-bmm-ink transition-colors"
                >
                  <Icon name="chevron" open={stackExpanded} className="text-[0.65rem]"/>
                  {t('crash-label-stack')}
                </button>
                {stackExpanded && (
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-bmm-border bg-bmm-surface-muted px-3.5 py-3 text-[0.6875rem] leading-5 text-bmm-muted whitespace-pre">
                    {crash.stackFrames.join('\n')}
                  </pre>
                )}
              </div>
            )}

            {/* Loaded mods (collapsible, default collapsed) */}
            {crash.loadedMods.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={this.toggleMods}
                  className="flex items-center gap-1.5 text-xs font-bold text-bmm-muted hover:text-bmm-ink transition-colors"
                >
                  <Icon name="chevron" open={modsExpanded} className="text-[0.65rem]"/>
                  {t('crash-label-loaded-mods')}
                  <span className="ml-1 text-bmm-muted font-normal">({crash.loadedMods.length})</span>
                </button>
                {modsExpanded && (
                  <ul className="mt-2 m-0 flex max-h-48 list-none flex-col overflow-y-auto rounded-lg border border-bmm-border bg-bmm-surface-muted p-0">
                    {crash.loadedMods.map(m => (
                      <li key={m} className="border-b border-bmm-border px-3.5 py-1.5 text-[0.6875rem] text-bmm-muted last:border-b-0">
                        {m}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Paste URL (shown after successful upload) */}
            {uploadState === 'success' && pasteUrl && (
              <div className="rounded-lg border border-bmm-border bg-bmm-surface-muted px-3.5 py-2.5 flex items-center gap-2">
                <a
                  href={pasteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-xs text-bmm-accent truncate hover:underline"
                >
                  {pasteUrl}
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-bmm-border bg-bmm-surface-raised px-5 py-3.5">
            <Button
              variant={uploadState === 'error' ? 'danger' : 'neutral'}
              onClick={this.handleUpload}
              disabled={uploadState === 'uploading'}
            >
              {uploadState === 'uploading' && t('crash-upload-uploading')}
              {uploadState === 'success' && t('crash-upload-copy')}
              {uploadState === 'error' && t('crash-upload-error')}
              {uploadState === 'idle' && t('crash-button-upload')}
            </Button>
            <Button variant="danger" onClick={this.handleDismiss}>
              {t('crash-button-dismiss')}
            </Button>
          </div>
        </div>
      </ModalBackdrop>
    );
  }
}
