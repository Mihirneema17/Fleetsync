
'use client';
import { Menu, Search, Bell, UserCircle, Moon, Sun, AlertCircle, Loader2, FileText, CarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SidebarTrigger } from '@/components/ui/sidebar'; 
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from 'next-themes';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { getRecentUnreadAlertsAction, getUnreadAlertsCountAction, globalSearchAction } from '@/app/global-actions';
import type { Alert, SearchResultItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, parseISO } from 'date-fns';

// Custom hook for debouncing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export function Header() {
  const isMobile = useIsMobile();
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [unreadAlerts, setUnreadAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const fetchAlertData = useCallback(async () => {
    setIsLoadingAlerts(true);
    try {
      const [count, alerts] = await Promise.all([
        getUnreadAlertsCountAction(),
        getRecentUnreadAlertsAction(5)
      ]);
      setUnreadCount(count);
      setUnreadAlerts(alerts);
    } catch (error) {
      console.error("Failed to fetch alert data for header:", error);
      setUnreadCount(0);
      setUnreadAlerts([]);
    } finally {
      setIsLoadingAlerts(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchAlertData(); // Fetch on mount
    const intervalId = setInterval(fetchAlertData, 60000); // Refresh every 60 seconds
    return () => clearInterval(intervalId);
  }, [fetchAlertData]);

  useEffect(() => {
    const performSearch = async () => {
      if (debouncedSearchQuery.trim().length < 2) {
        setSearchResults([]);
        setIsSearchDropdownOpen(false);
        return;
      }
      setIsSearchLoading(true);
      setIsSearchDropdownOpen(true);
      try {
        const results = await globalSearchAction(debouncedSearchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error("Global search failed:", error);
        setSearchResults([]);
      } finally {
        setIsSearchLoading(false);
      }
    };
    performSearch();
  }, [debouncedSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSearchFocus = () => {
    if (searchQuery.trim().length >= 2 && searchResults.length > 0) {
        setIsSearchDropdownOpen(true);
    } else if (searchQuery.trim().length >=2 && isSearchLoading) {
        setIsSearchDropdownOpen(true);
    }
  };
  
  const handleSearchItemClick = () => {
    setIsSearchDropdownOpen(false);
    setSearchQuery(''); // Optionally clear search query after selection
  };
  
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsSearchDropdownOpen(false);
    }
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card px-4 md:px-6 shadow-sm">
      {isMobile && <SidebarTrigger />}
      <div className="flex-1">
        {/* Optional: Add a title or breadcrumbs here */}
      </div>
      <div className="flex items-center gap-2 md:gap-4">
        <div className="relative" ref={searchContainerRef}>
          <form className="relative hidden md:block" onSubmit={(e) => e.preventDefault()}>
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search Reg No, Policy..."
              className="pl-8 sm:w-[200px] md:w-[200px] lg:w-[300px] rounded-full bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={handleSearchFocus}
              onKeyDown={handleKeyDown}
            />
          </form>
          {isSearchDropdownOpen && searchQuery.trim().length >= 2 && (
            <div className="absolute top-full mt-2 w-full md:w-[300px] lg:w-[360px] rounded-md border bg-popover text-popover-foreground shadow-lg z-50 max-h-96 overflow-y-auto">
              {isSearchLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...
                </div>
              ) : searchResults.length > 0 ? (
                <ul className="py-1">
                  {searchResults.map((item) => (
                    <li key={item.id}>
                      <Link href={item.link} passHref legacyBehavior>
                        <a
                          onClick={handleSearchItemClick}
                          className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                        >
                          {item.type === 'vehicle' ? <CarIcon className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
                          <div className="flex-grow">
                            <p className="font-medium truncate">{item.title}</p>
                            {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                          </div>
                        </a>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center">
                  <AlertCircle className="mr-2 h-4 w-4" /> No results found for "{searchQuery}".
                </div>
              )}
            </div>
          )}
        </div>

        {mounted && (
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full">
            {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span className="sr-only">Toggle theme</span>
          </Button>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full relative">
              <Bell className="h-5 w-5" />
              {mounted && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
                  {unreadCount}
                </span>
              )}
              <span className="sr-only">Toggle notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex justify-between items-center">
              <span>Notifications</span>
              {isLoadingAlerts && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isLoadingAlerts && unreadAlerts.length === 0 ? (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground text-center justify-center">Loading notifications...</DropdownMenuItem>
            ) : unreadAlerts.length === 0 ? (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground text-center justify-center">No new notifications</DropdownMenuItem>
            ) : (
              <>
                {unreadAlerts.map(alert => (
                  <DropdownMenuItem key={alert.id} asChild className="cursor-pointer">
                    <Link href={`/vehicles/${alert.vehicleId}?scrollToDoc=${alert.id}`}>
                      <div className="flex flex-col w-full">
                        <span className="text-xs font-semibold truncate">
                          {alert.documentType === 'Other' && alert.customDocumentTypeName ? alert.customDocumentTypeName : alert.documentType} for {alert.vehicleRegistration}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{alert.message.split('(Policy:')[0].trim()}</span>
                        <span className="text-xs text-muted-foreground/80 mt-0.5">
                          Due: {formatDistanceToNow(parseISO(alert.dueDate), { addSuffix: true })}
                        </span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/alerts" className="justify-center">View All Alerts</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src="https://placehold.co/100x100.png?text=U" alt="User avatar" data-ai-hint="user avatar" />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
