import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface ModalPanelProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className' | 'title'> {
  actions?: ComponentChildren;
  children: ComponentChildren;
  className?: string;
  footer?: ComponentChildren;
  subtitle?: ComponentChildren;
  title?: ComponentChildren;
}

export default function ModalPanel({actions, children, className, footer, subtitle, title, ...props}: ModalPanelProps) {
  return (
    <div
      {...props}
      className={cn(
        'flex w-[min(92vw,860px)] max-h-[min(90vh,860px)] flex-col overflow-hidden rounded-lg border border-white/70 bg-bmm-surface shadow-bmm-panel ring-1 ring-slate-950/5 max-[720px]:h-dvh max-[720px]:max-h-dvh max-[720px]:w-dvw max-[720px]:max-w-dvw max-[720px]:rounded-none max-[720px]:border-0 max-[720px]:ring-0',
        className,
      )}
    >
      {(title || subtitle || actions) && (
        <div
          className="flex items-start justify-between gap-4 border-b border-bmm-border bg-bmm-surface-raised px-5 py-4">
          <div>
            {title && <h2 className="m-0 text-xl font-bold leading-tight text-bmm-ink">{title}</h2>}
            {subtitle && <p className="mt-1.5 text-sm leading-6 text-bmm-muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="border-t border-bmm-border bg-bmm-surface-raised px-5 py-3.5">{footer}</div>}
    </div>
  );
}
