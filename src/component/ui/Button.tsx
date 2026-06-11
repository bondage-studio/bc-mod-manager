import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

export type ButtonVariant = 'primary' | 'neutral' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'md' | 'sm';

interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'className' | 'size'> {
  children: ComponentChildren;
  className?: string;
  icon?: ComponentChildren;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export default function Button({
                                 children,
                                 className,
                                 icon,
                                 size = 'md',
                                 type = 'button',
                                 variant = 'neutral',
                                 ...props
                               }: ButtonProps) {
  const variantClass = {
    primary: 'border-bmm-accent bg-bmm-accent text-white shadow-bmm-control hover:border-bmm-accent-strong hover:bg-bmm-accent-strong',
    neutral: 'border-bmm-border-strong bg-bmm-surface text-bmm-ink shadow-bmm-control hover:border-bmm-accent/40 hover:bg-bmm-accent-soft hover:text-bmm-accent-strong',
    danger: 'border-red-200 bg-red-50 text-red-700 shadow-bmm-control hover:border-red-300 hover:bg-red-100 hover:text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-bmm-control hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800',
    ghost: 'border-transparent bg-transparent px-1.5 text-bmm-accent hover:bg-bmm-accent-soft hover:text-bmm-accent-strong',
  }[variant];
  const sizeClass = size === 'sm'
    ? 'min-h-[1.875rem] px-2.5 py-1.5 text-[0.78125rem]'
    : 'min-h-9 px-3 py-2 text-[0.8125rem]';

  return (
    <button
      {...props}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border text-center font-bold leading-tight tracking-normal transition-[background,border-color,color,transform] duration-150 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bmm-accent/25 focus-visible:ring-offset-2',
        variantClass,
        sizeClass,
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
