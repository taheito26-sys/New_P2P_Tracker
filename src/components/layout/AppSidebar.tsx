import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
  Users,
  Settings,
  Bell,
  LogOut,
  ChevronLeft,
  Calendar,
  UserCircle,
  CloudUpload,
  X,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useT, type TranslationKey } from '@/lib/i18n';
import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/api';
import { useRealtime } from '@/hooks/use-realtime';

export const tradingNav: { labelKey: TranslationKey; icon: any; path: string }[] = [
  { labelKey: 'dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { labelKey: 'orders', icon: ArrowLeftRight, path: '/trading/orders' },
  { labelKey: 'stock', icon: Wallet, path: '/trading/stock' },
  { labelKey: 'calendar', icon: Calendar, path: '/trading/calendar' },
  { labelKey: 'p2pTracker', icon: TrendingUp, path: '/trading/p2p' },
  { labelKey: 'crm', icon: UserCircle, path: '/crm' },
];

export const networkNav: { labelKey: TranslationKey; icon: any; path: string }[] = [
  { labelKey: 'network', icon: Users, path: '/network' },
  { labelKey: 'vault', icon: CloudUpload, path: '/vault' },
  { labelKey: 'settings', icon: Settings, path: '/settings' },
];

type AppSidebarProps = {
  isMobile?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

function useUnreadMessageCount() {
  const { profile, userId, isAuthenticated, logout } = useAuth();
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { relationships } = await api.relationships.list();
      let total = 0;
      for (const rel of relationships) {
        const { messages } = await api.messages.list(rel.id);
        total += messages.filter(m => !m.is_read && m.sender_user_id !== userId).length;
      }
      setUnreadMsgCount(total);
    } catch {}
  }, [isAuthenticated, userId]);

  useEffect(() => { fetchUnread(); }, [fetchUnread]);

  // Refresh on new messages
  useRealtime((event) => {
    if (event.type === 'new_message') {
      fetchUnread();
    }
  });

  return { unreadMsgCount, profile, logout };
}

export function MobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const location = useLocation();
  const t = useT();
  const { unreadMsgCount } = useUnreadMessageCount();
  const primaryNav = [
    tradingNav[0],
    tradingNav[1],
    tradingNav[2],
    tradingNav[4],
    networkNav[0],
    tradingNav[3],
    networkNav[1],
  ];

  return (
    <nav className="mobile-bottom-nav md:hidden" dir={t.isRTL ? 'rtl' : 'ltr'} aria-label="Mobile navigation">
      {primaryNav.map((item) => {
        const active = location.pathname === item.path || (item.path === '/network' && location.pathname.startsWith('/network'));
        const showBadge = item.path === '/network' && unreadMsgCount > 0;

        return (
          <Link key={item.path} to={item.path} className={cn('mobile-bottom-nav__item', active && 'is-active')}>
            <span className="mobile-bottom-nav__icon-wrap">
              <item.icon className="mobile-bottom-nav__icon" />
              {showBadge && <span className="mobile-bottom-nav__badge">{unreadMsgCount > 9 ? '9+' : unreadMsgCount}</span>}
            </span>
            <span className="mobile-bottom-nav__label">{t(item.labelKey)}</span>
          </Link>
        );
      })}
      <button type="button" onClick={onMoreClick} className="mobile-bottom-nav__item">
        <span className="mobile-bottom-nav__icon-wrap">
          <MoreHorizontal className="mobile-bottom-nav__icon" />
        </span>
        <span className="mobile-bottom-nav__label">More</span>
      </button>
    </nav>
  );
}

export function AppSidebar({ isMobile = false, mobileOpen = false, onMobileClose }: AppSidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const t = useT();
  const { unreadMsgCount, profile, logout } = useUnreadMessageCount();

  const sidebarContent = (
    <aside
      dir={t.isRTL ? 'rtl' : 'ltr'}
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300',
        isMobile
          ? 'w-[320px] max-w-[88vw] shadow-2xl'
          : collapsed
            ? 'w-14'
            : 'w-52'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-sidebar-primary-foreground" />
            </div>
            <span className="font-display font-bold text-sm tracking-tight">{t('tracker')}</span>
          </div>
        )}
        {isMobile ? (
          <button
            onClick={onMobileClose}
            className="rounded-md p-1.5 transition-colors hover:bg-sidebar-accent"
            aria-label="Close navigation"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={() => setCollapsed(!collapsed)} className="rounded-md p-1.5 transition-colors hover:bg-sidebar-accent" type="button">
            <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
          </button>
        )}
      </div>

      {/* Profile */}
      {profile && !collapsed && (
        <div className="px-4 py-3 border-b border-sidebar-border">
          <p className="text-xs font-mono text-sidebar-primary truncate">{profile.merchant_id}</p>
          <p className="text-sm font-medium truncate">{profile.display_name}</p>
          <p className="text-xs text-muted-foreground truncate">@{profile.nickname}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-1">
        {!collapsed && <p className="px-4 pt-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{t('trading')}</p>}
        {tradingNav.map(item => {
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={isMobile ? onMobileClose : undefined}
              className={cn(
                'flex items-center gap-3 mx-2 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{t(item.labelKey)}</span>}
            </Link>
          );
        })}

        {!collapsed && <p className="px-4 pt-5 pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{t('network')}</p>}
        {networkNav.map(item => {
          const active = location.pathname === item.path || (item.path === '/network' && location.pathname.startsWith('/network'));
          const isNetworkItem = item.path === '/network';
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={isMobile ? onMobileClose : undefined}
              className={cn(
                'flex items-center gap-3 mx-2 px-3 py-2 rounded-md text-sm transition-colors relative',
                active
                  ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{t(item.labelKey)}</span>}
              {isNetworkItem && unreadMsgCount > 0 && (
                <span className={cn(
                  'rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center',
                  collapsed ? 'absolute -top-0.5 -right-0.5 w-4 h-4' : 'ml-auto w-5 h-5'
                )}>
                  {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        <Link
          to="/notifications"
          onClick={isMobile ? onMobileClose : undefined}
          className="flex items-center gap-3 mx-0 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent transition-colors"
        >
          <Bell className="w-4 h-4" />
          {!collapsed && <span>{t('notifications')}</span>}
        </Link>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-destructive hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>{t('logout')}</span>}
        </button>
      </div>
    </aside>
  );

  if (!isMobile) {
    return sidebarContent;
  }

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 md:hidden',
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onMobileClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </div>
    </>
  );
}
