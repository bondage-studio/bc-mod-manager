import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface ListProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className'> {
  children: ComponentChildren;
  className?: string;
}

export default function List({children, className, ...props}: ListProps) {
  return (
    <div {...props}
         className={cn('overflow-hidden rounded-lg border border-bmm-border bg-bmm-surface shadow-bmm-card', className)}>
      {children}
    </div>
  );
}
