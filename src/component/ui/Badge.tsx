import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

interface BadgeProps extends Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'class' | 'className'> {
  children: ComponentChildren;
  className?: string;
  variant?: BadgeVariant;
}

export default function Badge({children, className, variant = 'neutral', ...props}: BadgeProps) {
  const variantClass = {
    neutral: 'border-bmm-border bg-bmm-surface-muted text-bmm-muted',
    primary: 'border-blue-200 bg-bmm-accent-soft text-bmm-accent-strong',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
  }[variant];

  return (
    <span
      {...props}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-1 text-[0.71875rem] font-bold leading-none shadow-[0_1px_0_rgb(15_23_42/0.04)]',
        variantClass,
        className,
      )}
    >
      {children}
    </span>
  );
}
