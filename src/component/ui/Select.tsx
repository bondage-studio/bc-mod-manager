import type {JSX} from 'preact';
import cn from '@/util/cn.ts';

interface SelectProps extends Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, 'class' | 'className'> {
  className?: string;
  compact?: boolean;
}

export default function Select({className, compact = false, ...props}: SelectProps) {
  const hasWidthClass = className?.includes('w-') || className?.includes('w[');
  const sizeClass = compact
    ? 'min-h-8 px-2.5 py-1.5 text-[0.8125rem]'
    : 'min-h-9 px-3 py-2';

  return (
    <select
      {...props}
      className={cn(
        !hasWidthClass && 'w-full',
        'rounded-lg border border-bmm-border-strong bg-bmm-surface text-bmm-ink shadow-bmm-control transition-[background,border-color,box-shadow] duration-150 hover:border-bmm-accent/45 focus:border-bmm-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-bmm-accent/15',
        sizeClass,
        className,
      )}
    />
  );
}
