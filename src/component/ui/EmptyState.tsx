import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface EmptyStateProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className' | 'title'> {
  children?: ComponentChildren;
  className?: string;
  description?: ComponentChildren;
  title: ComponentChildren;
}

export default function EmptyState({children, className, description, title, ...props}: EmptyStateProps) {
  return (
    <div {...props} className={cn('px-4 py-12 text-center text-bmm-muted', className)}>
      <div className="text-base font-bold text-bmm-ink">{title}</div>
      {description && <div className="mt-1.5 text-sm leading-6">{description}</div>}
      {children}
    </div>
  );
}
