import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3 border-b px-3 py-4 sm:px-4 md:flex-row md:items-center md:justify-between md:px-6', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-display font-bold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 md:justify-end">{children}</div>}
    </div>
  );
}
