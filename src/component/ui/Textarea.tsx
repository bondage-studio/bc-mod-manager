import type {JSX} from 'preact';
import cn from '@/util/cn.ts';

interface TextareaProps extends Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, 'class' | 'className'> {
  className?: string;
}

export default function Textarea({className, ...props}: TextareaProps) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-9 w-full resize-y rounded-lg border border-bmm-border-strong bg-bmm-surface px-3 py-2.5 text-bmm-ink shadow-bmm-control transition-[background,border-color,box-shadow] duration-150 placeholder:text-bmm-faint hover:border-bmm-accent/45 focus:border-bmm-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-bmm-accent/15',
        className,
      )}
    />
  );
}
