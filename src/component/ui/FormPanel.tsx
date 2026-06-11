import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface FormPanelProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className' | 'title'> {
  children: ComponentChildren;
  className?: string;
  title?: ComponentChildren;
}

export default function FormPanel({children, className, title, ...props}: FormPanelProps) {
  return (
    <div {...props}
         className={cn('rounded-lg border border-bmm-border bg-bmm-surface-raised p-4 shadow-bmm-control', className)}>
      {title && <h3 className="mb-4 text-base font-bold tracking-normal text-bmm-ink">{title}</h3>}
      {children}
    </div>
  );
}
