import type {ComponentChildren} from 'preact';
import cn from '@/util/cn.ts';

export interface AppLauncherItem {
  id: string;
  label: ComponentChildren;
  onClick: () => void;
}

interface AppLauncherProps {
  items: AppLauncherItem[];
  onToggle: () => void;
  open: boolean;
  title: string;
}

export default function AppLauncher({items, onToggle, open, title}: AppLauncherProps) {
  return (
    <div className="fixed right-6 top-5 z-50 flex flex-col items-end sm:right-12">
      <button
        type="button"
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full border border-bmm-accent bg-bmm-accent text-[1.75rem] font-medium leading-none text-white shadow-bmm-card transition-[background,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-bmm-accent-strong hover:bg-bmm-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bmm-accent/30 focus-visible:ring-offset-2',
          open && 'rotate-45',
        )}
        onClick={onToggle}
        title={title}
        aria-expanded={open}
        aria-label={title}
      >
        +
      </button>

      <div
        className={cn(
          'mt-2.5 flex origin-top-right flex-col items-end gap-2 overflow-hidden transition-[max-height,opacity,transform] duration-200',
          open
            ? 'pointer-events-auto max-h-80 translate-y-0 opacity-100'
            : 'pointer-events-none max-h-0 -translate-y-2 opacity-0',
        )}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              'min-h-9 w-max min-w-[9.75rem] origin-top-right whitespace-nowrap rounded-lg border border-bmm-border bg-bmm-surface px-3 py-2 text-[0.8125rem] font-semibold text-bmm-ink shadow-bmm-card transition-[background,border-color,color,transform] duration-150 hover:-translate-y-px hover:border-bmm-accent/40 hover:bg-bmm-accent-soft hover:text-bmm-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bmm-accent/25 focus-visible:ring-offset-2',
            )}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
