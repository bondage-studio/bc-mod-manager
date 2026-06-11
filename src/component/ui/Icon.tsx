import type {JSX} from 'preact';
import cn from '@/util/cn.ts';

export type IconName = 'refresh' | 'download' | 'delete' | 'chevron';

interface IconProps extends Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'class' | 'className'> {
  className?: string;
  name: IconName;
  open?: boolean;
  spin?: boolean;
}

export default function Icon({className, name, open = false, spin = false, ...props}: IconProps) {
  const content = {
    refresh: '↻',
    download: '↓',
    delete: '×',
    chevron: '›',
  }[name];

  return (
    <span
      {...props}
      aria-hidden="true"
      className={cn(
        'inline-flex w-[1em] items-center justify-center text-[0.95em] leading-none text-current',
        name === 'chevron' && open && 'rotate-90',
        spin && 'animate-spin',
        className,
      )}
    >
      {content}
    </span>
  );
}
