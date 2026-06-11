import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface ListRowProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className'> {
  children: ComponentChildren;
  className?: string;
}

export default function ListRow({children, className, ...props}: ListRowProps) {
  return (
    <div {...props}
         className={cn('border-t border-bmm-border px-4 py-4 transition-colors first:border-t-0 hover:bg-bmm-surface-muted', className)}>
      {children}
    </div>
  );
}
