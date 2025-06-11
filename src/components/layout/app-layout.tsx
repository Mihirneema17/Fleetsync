import React from 'react';
import { SidebarNav } from './sidebar-nav';
import { Header } from './header';
import { SidebarProvider } from '@/components/ui/sidebar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full">
        <SidebarNav />
        <div className="flex flex-1 flex-col">
          <Header />
          <main className="flex-1 p-6 bg-background overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
