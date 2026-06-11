import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface FieldProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className'> {
  children: ComponentChildren;
  className?: string;
  full?: boolean;
  label: ComponentChildren;
}

export default function Field({children, className, full = false, label, ...props}: FieldProps) {
  return (
    <div {...props} className={cn(full && 'col-span-full', className)}>
      <label className="mb-1.5 block text-[0.8125rem] font-semibold text-bmm-ink">{label}</label>
      {children}
    </div>
  );
}
