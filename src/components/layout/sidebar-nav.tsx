
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, Bell, Car, ClipboardList, LogOut, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  SidebarMenuBadge,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { SheetTitle } from '@/components/ui/sheet';
import React, { useEffect, useState } from 'react';
import type { User } from '@/lib/types';
import { getCurrentUserAction, getUnreadAlertsCountAction } from '@/app/global-actions';
import Image from 'next/image';

const navItems = [
  { href: '/', label: 'Dashboard', icon: BarChart2 },
  { href: '/vehicles', label: 'Vehicles', icon: Car },
  { href: '/alerts', label: 'Alerts', icon: Bell, id: 'alertsLink' },
  { href: '/reports/expiring-documents', label: 'Reports', icon: ClipboardList, id: 'reportsLink' },
];

const adminNavItems = [
    { href: '/admin/audit-logs', label: 'Audit Logs', icon: ShieldQuestion }
];

export function SidebarNav() {
  const pathname = usePathname();
  const { state: sidebarState, isMobile, setOpenMobile } = useSidebar(); // Added setOpenMobile
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    async function fetchInitialData() {
      try {
        const user = await getCurrentUserAction();
        setCurrentUser(user);

        const count = await getUnreadAlertsCountAction();
        setUnreadAlertsCount(count);
      } catch (error) {
        console.error("Failed to fetch initial sidebar data:", error);
        setUnreadAlertsCount(0);
      }
    }
    fetchInitialData();

    const intervalId = setInterval(async () => {
        try {
            const count = await getUnreadAlertsCountAction();
            setUnreadAlertsCount(count);
        } catch (error) {
            console.error("Failed to refresh alert count:", error);
        }
    }, 60000);
    return () => clearInterval(intervalId);
  }, []);

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar side="left" variant="sidebar" collapsible="icon">
      <SidebarHeader className="p-4">
         {isMobile ? (
           <SheetTitle asChild>
            <Link href="/" className="flex items-center gap-2" onClick={handleLinkClick}>
                <Image
                    src="/raj-ratan-logo.png"
                    alt="Raj Ratan Tours & Travels Logo"
                    width={32}
                    height={32}
                    className="h-8 w-8 object-contain rounded-sm"
                    data-ai-hint="company logo"
                />
                <span className="text-base font-bold font-headline text-primary">Raj Ratan</span>
            </Link>
           </SheetTitle>
        ) : (
          <Link href="/" className="flex items-center gap-2">
            <Image
                src="/raj-ratan-logo.png"
                alt="Raj Ratan Tours & Travels Logo"
                width={36}
                height={36}
                className="h-9 w-9 object-contain rounded-sm"
                data-ai-hint="company logo"
            />
            {sidebarState === 'expanded' && (
              <h1 className="text-base font-bold font-headline text-primary truncate">Raj Ratan</h1>
            )}
          </Link>
        )}
      </SidebarHeader>
      <SidebarContent className="flex-1">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                className={cn(
                  'w-full justify-start',
                  pathname === item.href || (item.href.startsWith('/reports') && pathname.startsWith('/reports'))
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                )}
                isActive={pathname === item.href || (item.href.startsWith('/reports') && pathname.startsWith('/reports'))}
                tooltip={sidebarState === 'collapsed' ? item.label : undefined}
                onClick={handleLinkClick}
              >
                <Link href={item.href}>
                  <item.icon className="h-5 w-5 mr-3" />
                  {sidebarState === 'expanded' && <span className="truncate">{item.label}</span>}
                  {item.id === 'alertsLink' && unreadAlertsCount > 0 && sidebarState === 'expanded' && (
                     <SidebarMenuBadge className="ml-auto bg-destructive text-destructive-foreground">
                       {unreadAlertsCount}
                     </SidebarMenuBadge>
                  )}
                   {item.id === 'alertsLink' && unreadAlertsCount > 0 && sidebarState === 'collapsed' && (
                     <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive border-2 border-[var(--sidebar-background)]" />
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        {currentUser?.role === 'admin' && (
            <>
                <SidebarSeparator className="my-4" />
                <SidebarMenuItem>
                    <div className={cn("px-4 py-2 text-xs font-semibold text-muted-foreground", sidebarState === 'collapsed' ? 'hidden' : '')}>Admin</div>
                </SidebarMenuItem>
                <SidebarMenu>
                {adminNavItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                        asChild
                        className={cn(
                        'w-full justify-start',
                        pathname.startsWith(item.href)
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted'
                        )}
                        isActive={pathname.startsWith(item.href)}
                        tooltip={sidebarState === 'collapsed' ? item.label : undefined}
                        onClick={handleLinkClick}
                    >
                        <Link href={item.href}>
                        <item.icon className="h-5 w-5 mr-3" />
                        {sidebarState === 'expanded' && <span className="truncate">{item.label}</span>}
                        </Link>
                    </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
                </SidebarMenu>
            </>
        )}
      </SidebarContent>
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
             <SidebarMenuButton
                className="w-full justify-start hover:bg-muted"
                tooltip={sidebarState === 'collapsed' ? "Log Out" : undefined}
                // onClick={handleLogout} // Future: Add logout functionality
                onClick={handleLinkClick} // Example, if logout was a link
                >
                <LogOut className="h-5 w-5 mr-3" />
                {sidebarState === 'expanded' && <span className="truncate">Log Out</span>}
             </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
