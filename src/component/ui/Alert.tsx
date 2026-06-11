import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

type AlertVariant = 'danger' | 'success';

interface AlertProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className'> {
  children: ComponentChildren;
  className?: string;
  variant?: AlertVariant;
}

export default function Alert({children, className, variant = 'danger', ...props}: AlertProps) {
  const variantClass = {
    danger: 'border-red-200 bg-red-50 text-red-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }[variant];

  return (
    <div
      {...props}
      className={cn('mb-4 rounded-lg border px-3.5 py-3 text-sm font-semibold shadow-bmm-control', variantClass, className)}
    >
      {children}
    </div>
  );
}
