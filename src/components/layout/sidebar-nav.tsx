
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, List, BarChart2, Bell, Settings, Car, FileText, Users, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSeparator,
  SidebarMenuBadge,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { SheetTitle } from '@/components/ui/sheet';
import React, { useEffect, useState } from 'react';
import { getAlerts } from '@/lib/data'; // Import getAlerts

const navItems = [
  { href: '/', label: 'Dashboard', icon: BarChart2 },
  { href: '/vehicles', label: 'Vehicles', icon: Car },
  { href: '/alerts', label: 'Alerts', icon: Bell, id: 'alertsLink' },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { state: sidebarState, isMobile } = useSidebar();
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);

  useEffect(() => {
    async function fetchAlertCount() {
      try {
        const unreadAlerts = await getAlerts(true); // true for onlyUnread
        setUnreadAlertsCount(unreadAlerts.length);
      } catch (error) {
        console.error("Failed to fetch alert count:", error);
        setUnreadAlertsCount(0); // Default to 0 on error
      }
    }
    fetchAlertCount();
    
    // Optional: set up an interval to refresh count, or use a more sophisticated state management
    const intervalId = setInterval(fetchAlertCount, 60000); // Refresh every minute
    return () => clearInterval(intervalId);
  }, []);


  return (
    <Sidebar side="left" variant="sidebar" collapsible="icon">
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2">
          <Home className="h-8 w-8 text-primary" />
          {isMobile && sidebarState === 'collapsed' ? ( // Check if mobile and collapsed
            <SheetTitle className="text-xl font-bold font-headline text-primary">FleetSync</SheetTitle>
          ) : (
            sidebarState === 'expanded' && (
              <h1 className="text-xl font-bold font-headline text-primary">FleetSync</h1>
            )
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex-1">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                className={cn(
                  'w-full justify-start',
                  pathname === item.href ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                )}
                isActive={pathname === item.href}
                tooltip={sidebarState === 'collapsed' ? item.label : undefined}
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
      </SidebarContent>
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
             <SidebarMenuButton 
                className="w-full justify-start hover:bg-muted"
                tooltip={sidebarState === 'collapsed' ? "Log Out" : undefined}
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
