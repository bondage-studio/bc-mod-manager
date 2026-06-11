import type {JSX} from 'preact';
import cn from '@/util/cn.ts';
import i18n from '@/i18n/i18n';

type CloseButtonVariant = 'app' | 'dialog' | 'modal';

interface CloseButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'className'> {
  className?: string;
  variant?: CloseButtonVariant;
}

export default function CloseButton({
                                      className,
                                      title,
                                      type = 'button',
                                      variant = 'modal',
                                      ...props
                                    }: CloseButtonProps) {
  const variantClass = variant === 'app' ? 'absolute right-4 top-4 z-[3]' : '';

  return (
    <button
      {...props}
      type={type}
      title={title ?? i18n('button-close')}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-bmm-border bg-bmm-surface text-2xl font-medium leading-none text-bmm-muted shadow-bmm-control transition-[background,border-color,color,transform] duration-150 hover:-translate-y-px hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/20 focus-visible:ring-offset-2',
        variantClass,
        className,
      )}
    >
      ×
    </button>
  );
}
