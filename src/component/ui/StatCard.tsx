import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

type StatCardVariant = 'primary' | 'success' | 'neutral' | 'warning' | 'danger';

interface StatCardProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className'> {
  className?: string;
  label: ComponentChildren;
  value: ComponentChildren;
  variant?: StatCardVariant;
}

export default function StatCard({className, label, value, variant = 'neutral', ...props}: StatCardProps) {
  const variantClass = {
    primary: 'border-blue-200 border-l-bmm-accent bg-blue-50/80',
    success: 'border-emerald-200 border-l-emerald-600 bg-emerald-50/80',
    neutral: 'border-bmm-border border-l-bmm-muted bg-bmm-surface',
    warning: 'border-amber-200 border-l-amber-600 bg-amber-50/80',
    danger: 'border-red-200 border-l-red-600 bg-red-50/80',
  }[variant];

  return (
    <div {...props}
         className={cn('rounded-lg border border-l-4 px-4 py-3 shadow-bmm-control', variantClass, className)}>
      <div className="text-2xl font-bold leading-none tracking-normal text-bmm-ink">{value}</div>
      <div className="mt-1.5 text-[0.8125rem] font-semibold text-bmm-muted">{label}</div>
    </div>
  );
}
