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
} from '@/components/ui/sidebar'; // Assuming this is the path to your sidebar components
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/', label: 'Dashboard', icon: BarChart2 },
  { href: '/vehicles', label: 'Vehicles', icon: Car },
  // { href: '/documents', label: 'Documents', icon: FileText }, // Future
  { href: '/alerts', label: 'Alerts', icon: Bell, badgeCount: 0 }, // Placeholder for badge
  // { href: '/users', label: 'User Management', icon: Users }, // Future
  // { href: '/settings', label: 'Settings', icon: Settings }, // Future
];

export function SidebarNav() {
  const pathname = usePathname();
  const { state: sidebarState } = useSidebar(); // Get sidebar state if needed for responsive text/icons

  // Placeholder for fetching alert count
  const unreadAlertsCount = 0; // Replace with actual data fetching

  return (
    <Sidebar side="left" variant="sidebar" collapsible="icon">
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2">
          <Home className="h-8 w-8 text-primary" />
          {sidebarState === 'expanded' && (
            <h1 className="text-xl font-bold font-headline text-primary">FleetSync</h1>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex-1">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} legacyBehavior passHref>
                <SidebarMenuButton
                  className={cn(
                    'w-full justify-start',
                    pathname === item.href ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                  )}
                  isActive={pathname === item.href}
                  tooltip={sidebarState === 'collapsed' ? item.label : undefined}
                >
                  <item.icon className="h-5 w-5 mr-3" />
                  {sidebarState === 'expanded' && <span className="truncate">{item.label}</span>}
                  {item.label === 'Alerts' && unreadAlertsCount > 0 && sidebarState === 'expanded' && (
                     <SidebarMenuBadge className="ml-auto bg-destructive text-destructive-foreground">
                       {unreadAlertsCount}
                     </SidebarMenuBadge>
                  )}
                </SidebarMenuButton>
              </Link>
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
