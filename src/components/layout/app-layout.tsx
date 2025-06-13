
"use client";

import React, { useEffect } from 'react';
import { SidebarNav } from './sidebar-nav';
import { Header } from './header';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { firebaseUser, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isAuthPage = pathname === '/auth/sign-in' || pathname === '/auth/sign-up';

  useEffect(() => {
    if (!isLoading && !firebaseUser && !isAuthPage) {
      router.push('/auth/sign-in');
    }
  }, [isLoading, firebaseUser, isAuthPage, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading application...</p>
      </div>
    );
  }

  if (!firebaseUser && isAuthPage) {
    // For sign-in and sign-up pages, render children directly without the main layout
    // This also prevents redirection loops if the user is already on an auth page.
    return <>{children}</>;
  }

  if (!firebaseUser && !isAuthPage) {
    // This case should ideally be caught by the useEffect redirect,
    // but as a fallback, show a loader while redirecting.
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Redirecting to sign-in...</p>
      </div>
    );
  }
  
  // If user is authenticated, show the full app layout
  if (firebaseUser) {
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

  // Fallback for any unhandled state, though ideally should not be reached
  // if logic above is correct. Render children if it's an auth page or redirect.
  return <>{isAuthPage ? children : null}</>;
}
    