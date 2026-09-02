import { SearchX } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="w-12 h-12 rounded-full bg-oat/30 flex items-center justify-center border border-oat">
        <SearchX size={24} className="text-espresso" />
      </div>
      <div>
        <p className="font-medium text-espresso font-serif">{title}</p>
        {description && <p className="text-sm text-shadow mt-1 max-w-xs mx-auto">{description}</p>}
      </div>
      {action}
    </div>
  );
}
