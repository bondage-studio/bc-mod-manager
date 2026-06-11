import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface StatsGridProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className'> {
  children: ComponentChildren;
  className?: string;
}

export default function StatsGrid({children, className, ...props}: StatsGridProps) {
  return (
    <div {...props}
         className={cn('mb-4 grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2.5', className)}>
      {children}
    </div>
  );
}
