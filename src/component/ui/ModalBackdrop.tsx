import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

interface ModalBackdropProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className'> {
  children: ComponentChildren;
  className?: string;
}

export default function ModalBackdrop({children, className, ...props}: ModalBackdropProps) {
  return (
    <div {...props}
         className={cn('fixed inset-0 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px] max-[720px]:p-0', className)}>
      {children}
    </div>
  );
}
