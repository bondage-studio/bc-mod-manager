import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface AppShellProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className'> {
  children: ComponentChildren;
  className?: string;
}

export default function AppShell({children, className, ...props}: AppShellProps) {
  return (
    <div
      {...props}
      className={cn(
        'relative flex w-[min(94vw,1200px)] max-h-[min(92vh,900px)] flex-col overflow-hidden rounded-lg border border-white/70 bg-bmm-canvas shadow-bmm-panel ring-1 ring-slate-950/5 max-[720px]:h-dvh max-[720px]:max-h-dvh max-[720px]:w-dvw max-[720px]:max-w-dvw max-[720px]:rounded-none max-[720px]:border-0 max-[720px]:ring-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
