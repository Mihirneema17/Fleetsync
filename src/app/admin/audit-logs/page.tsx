
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getAuditLogs, getCurrentUser } from '@/lib/data';
import type { AuditLogEntry, AuditLogAction, User } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { ShieldCheck, Search, FilterX, CalendarIcon, ArrowUpDown, ListFilter, Users } from 'lucide-react';
import { AUDIT_LOG_ACTIONS, AUDIT_ENTITY_TYPES, DATE_FORMAT } from '@/lib/constants';
import type { DateRange } from "react-day-picker";
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

type SortableAuditColumn = 'timestamp' | 'userId' | 'action' | 'entityType' | 'entityRegistration';
type SortDirection = 'asc' | 'desc';


export default function AuditLogsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Filters from URL state or component state
  const [actionFilter, setActionFilter] = useState<AuditLogAction | 'All'>(searchParams.get('action') as AuditLogAction || 'All');
  const [entityTypeFilter, setEntityTypeFilter] = useState<AuditLogEntry['entityType'] | 'All'>(searchParams.get('entityType') as AuditLogEntry['entityType'] || 'All');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || ''); // For entityId or entityRegistration
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: searchParams.get('from') ? parseISO(searchParams.get('from')!) : undefined,
    to: searchParams.get('to') ? parseISO(searchParams.get('to')!) : undefined,
  });

  const [sortColumn, setSortColumn] = useState<SortableAuditColumn>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const updateUrlParams = useCallback(() => {
    const currentParams = new URLSearchParams();
    if (actionFilter !== 'All') currentParams.set('action', actionFilter);
    if (entityTypeFilter !== 'All') currentParams.set('entityType', entityTypeFilter);
    if (searchTerm) currentParams.set('search', searchTerm);
    if (dateRange?.from) currentParams.set('from', format(dateRange.from, 'yyyy-MM-dd'));
    if (dateRange?.to) currentParams.set('to', format(dateRange.to, 'yyyy-MM-dd'));
    router.push(`${pathname}?${currentParams.toString()}`);
  }, [actionFilter, entityTypeFilter, searchTerm, dateRange, router, pathname]);
  
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const user = await getCurrentUser();
      setCurrentUser(user);
      if (user?.role !== 'admin') {
        // Basic protection, in a real app this would be route-level
        router.push('/'); 
        return;
      }

      const fetchedLogs = await getAuditLogs({
          action: actionFilter === 'All' ? undefined : actionFilter,
          entityType: entityTypeFilter === 'All' ? undefined : entityTypeFilter,
          dateFrom: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
          dateTo: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
      });
      setLogs(fetchedLogs);
      setIsLoading(false);
    }
    fetchData();
  }, [actionFilter, entityTypeFilter, dateRange, router]); // Re-fetch when server-side filters change

  // Client-side filtering for searchTerm
  const clientFilteredLogs = useMemo(() => {
    if (!searchTerm) return logs;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return logs.filter(log =>
        (log.entityId && log.entityId.toLowerCase().includes(lowerSearchTerm)) ||
        (log.entityRegistration && log.entityRegistration.toLowerCase().includes(lowerSearchTerm)) ||
        (log.userId && log.userId.toLowerCase().includes(lowerSearchTerm)) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(lowerSearchTerm))
    );
  }, [logs, searchTerm]);

  // Client-side sorting
  const sortedLogs = useMemo(() => {
    return [...clientFilteredLogs].sort((a, b) => {
      let valA: any = a[sortColumn];
      let valB: any = b[sortColumn];

      if (sortColumn === 'timestamp') {
        valA = parseISO(a.timestamp).getTime();
        valB = parseISO(b.timestamp).getTime();
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [clientFilteredLogs, sortColumn, sortDirection]);

  const handleSort = (column: SortableAuditColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(sortDirection === 'desc' && column === 'timestamp' ? 'desc' : 'asc'); // Default timestamp to desc
    }
  };

  const clearFilters = () => {
    setActionFilter('All');
    setEntityTypeFilter('All');
    setSearchTerm('');
    setDateRange(undefined);
    router.push(pathname || '/admin/audit-logs');
  };
  
  useEffect(() => {
    updateUrlParams();
  }, [updateUrlParams]);

  const renderSortIcon = (column: SortableAuditColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-3 w-3 opacity-30" />;
    return sortDirection === 'asc' ? <ArrowUpDown className="ml-2 h-3 w-3" /> : <ArrowUpDown className="ml-2 h-3 w-3" />;
  };

  if (isLoading && !currentUser) {
     return <div className="flex justify-center items-center h-64"><ListFilter className="w-12 h-12 animate-pulse text-primary" /><p className="ml-4 text-lg text-muted-foreground">Loading audit logs...</p></div>;
  }
  if (currentUser?.role !== 'admin') {
     return <div className="text-center py-12"><AlertTriangle className="mx-auto h-12 w-12 text-destructive" /><p className="mt-4 text-lg">Access Denied. You do not have permission to view this page.</p></div>;
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-headline flex items-center">
          <ShieldCheck className="mr-3 h-8 w-8 text-primary" />
          Audit Logs
        </h1>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Filter Audit Trail</CardTitle>
          <CardDescription>
            Review system and user activities. Use filters to narrow down the results.
          </CardDescription>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
            <Select value={actionFilter} onValueChange={(value) => setActionFilter(value as AuditLogAction | 'All')}>
              <SelectTrigger><SelectValue placeholder="Filter by Action" /></SelectTrigger>
              <SelectContent><SelectItem value="All">All Actions</SelectItem>{AUDIT_LOG_ACTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={entityTypeFilter} onValueChange={(value) => setEntityTypeFilter(value as AuditLogEntry['entityType'] | 'All')}>
              <SelectTrigger><SelectValue placeholder="Filter by Entity Type" /></SelectTrigger>
              <SelectContent><SelectItem value="All">All Entity Types</SelectItem>{AUDIT_ENTITY_TYPES.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
            </Select>
            <Popover>
                <PopoverTrigger asChild>
                    <Button id="date" variant={"outline"} className={cn("justify-start text-left font-normal h-10",!dateRange && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>) : (format(dateRange.from, "LLL dd, y"))) : (<span>Pick a date range</span>)}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2}/>
                </PopoverContent>
            </Popover>
            <div className="relative flex-grow lg:col-span-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="search" placeholder="Search User ID, Entity ID/Reg, Details..." className="pl-8 w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
            </div>
          </div>
          <div className="pt-2">
            <Button variant="outline" onClick={clearFilters} size="sm"><FilterX className="mr-2 h-4 w-4" /> Clear All Filters</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-64"><ListFilter className="w-12 h-12 animate-pulse text-primary" /><p className="ml-4 text-lg text-muted-foreground">Loading logs...</p></div>
          ) : sortedLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><ShieldCheck className="mx-auto h-16 w-16 mb-4" /><p className="text-xl font-semibold">No audit logs match your current filters.</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleSort('timestamp')} className="cursor-pointer hover:bg-muted/50 w-[180px]">Timestamp {renderSortIcon('timestamp')}</TableHead>
                  <TableHead onClick={() => handleSort('userId')} className="cursor-pointer hover:bg-muted/50 w-[120px]">User ID {renderSortIcon('userId')}</TableHead>
                  <TableHead onClick={() => handleSort('action')} className="cursor-pointer hover:bg-muted/50">Action {renderSortIcon('action')}</TableHead>
                  <TableHead onClick={() => handleSort('entityType')} className="cursor-pointer hover:bg-muted/50">Entity Type {renderSortIcon('entityType')}</TableHead>
                  <TableHead>Entity Ref.</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{format(parseISO(log.timestamp), `${DATE_FORMAT} HH:mm:ss`)}</TableCell>
                    <TableCell className="text-xs">{log.userId}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{log.action.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell>{log.entityType}</TableCell>
                    <TableCell className="text-xs">
                        {log.entityId && <div>ID: {log.entityId}</div>}
                        {log.entityRegistration && <div>Reg: {log.entityRegistration}</div>}
                    </TableCell>
                    <TableCell className="text-xs max-w-xs truncate">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="link" size="sm" className="p-0 h-auto text-xs" disabled={!log.details || Object.keys(log.details).length === 0}>View</Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80">
                                <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(log.details, null, 2)}</pre>
                            </PopoverContent>
                        </Popover>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
