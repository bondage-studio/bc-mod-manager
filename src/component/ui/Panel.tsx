import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface PanelProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className' | 'title'> {
  actions?: ComponentChildren;
  body?: boolean;
  children: ComponentChildren;
  className?: string;
  list?: boolean;
  title?: ComponentChildren;
}

export default function Panel({actions, body = false, children, className, list = false, title, ...props}: PanelProps) {
  return (
    <div {...props}
         className={cn('mt-4 overflow-hidden rounded-lg border border-bmm-border bg-bmm-surface shadow-bmm-card first:mt-0', className)}>
      {(title || actions) && (
        <div
          className="flex flex-col gap-3 border-b border-bmm-border bg-bmm-surface-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          {title && <h2 className="m-0 text-base font-bold tracking-normal text-bmm-ink">{title}</h2>}
          {actions}
        </div>
      )}
      {body ? <div className="px-4 py-3.5">{children}</div> : children}
    </div>
  );
}
