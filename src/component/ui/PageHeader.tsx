import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface PageHeaderProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className' | 'title'> {
  actions?: ComponentChildren;
  className?: string;
  subtitle?: ComponentChildren;
  title: ComponentChildren;
}

export default function PageHeader({actions, className, subtitle, title, ...props}: PageHeaderProps) {
  return (
    <div
      {...props}
      className={cn(
        'mb-5 flex flex-col gap-4 pr-12 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div>
        <h1 className="m-0 text-[1.625rem] font-bold leading-tight tracking-normal text-bmm-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-[0.9375rem] text-bmm-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
