import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface FormGridProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className'> {
  children: ComponentChildren;
  className?: string;
}

export default function FormGrid({children, className, ...props}: FormGridProps) {
  return (
    <div {...props} className={cn('grid grid-cols-1 gap-4 md:grid-cols-2', className)}>
      {children}
    </div>
  );
}
