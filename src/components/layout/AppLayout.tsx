import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { AppSidebar, MobileBottomNav } from './AppSidebar';
import { TrackerTopbar } from './TrackerTopbar';
import { useTheme } from '@/lib/theme-context';
import { useRealtime } from '@/hooks/use-realtime';
import { useIsMobile } from '@/hooks/use-mobile';

export function AppLayout() {
  const { settings } = useTheme();
  const isRTL = settings.language === 'ar';
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  
  // Start realtime polling engine
  useRealtime();

  return (
    <div className="app-shell flex h-[100dvh] w-full overflow-hidden" dir={isRTL ? 'rtl' : 'ltr'}>
      <AppSidebar
        isMobile={isMobile}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <main className="main-shell flex min-w-0 flex-1 flex-col overflow-hidden">
        <TrackerTopbar
          isMobile={isMobile}
          onMenuClick={isMobile ? () => setMobileSidebarOpen(true) : undefined}
        />
        <div className="app-content-scroll flex-1 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </div>
        {isMobile && <MobileBottomNav onMoreClick={() => setMobileSidebarOpen(true)} />}
      </main>
    </div>
  );
}
