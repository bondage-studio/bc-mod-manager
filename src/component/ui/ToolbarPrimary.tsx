import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface ToolbarPrimaryProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className'> {
  children: ComponentChildren;
  className?: string;
}

export default function ToolbarPrimary({children, className, ...props}: ToolbarPrimaryProps) {
  return (
    <div {...props} className={cn('min-w-[260px] flex-1', className)}>
      {children}
    </div>
  );
}
