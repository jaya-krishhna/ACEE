import { StudentNav } from '@/components/layout/StudentNav';
import { StudentSidebar } from '@/components/layout/StudentSidebar';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sunlit text-espresso">
      <StudentNav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex gap-8">
        <StudentSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
