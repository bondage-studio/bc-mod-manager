import type {ComponentChildren, JSX} from 'preact';
import cn from '@/util/cn.ts';

type PageSize = 'narrow' | 'wide' | 'xl';

interface PageProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'className'> {
  children: ComponentChildren;
  className?: string;
  size?: PageSize;
}

export default function Page({children, className, size = 'wide', ...props}: PageProps) {
  const sizeClass = {
    narrow: 'max-w-[960px]',
    wide: 'max-w-[1120px]',
    xl: 'max-w-[1280px]',
  }[size];

  return (
    <div {...props}
         className={cn('mx-auto min-h-0 w-full overflow-auto px-4 py-5 sm:px-6 sm:py-6', sizeClass, className)}>
      {children}
    </div>
  );
}
