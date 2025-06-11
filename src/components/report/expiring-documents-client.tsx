
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { recordCsvExportAudit } from '@/lib/data'; // For CSV export audit
import type { ReportableDocument, DocumentType as DocType } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { ClipboardList, AlertTriangle, Clock, CheckCircle2, Search, FilterX, Car, Download, CalendarIcon, ArrowUpDown, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { DOCUMENT_TYPES, DATE_FORMAT, EXPIRY_WARNING_DAYS } from '@/lib/constants';
import type { DateRange } from "react-day-picker";
import { useToast } from '@/hooks/use-toast';

type StatusFilter = 'All' | 'Overdue' | 'ExpiringSoon' | 'Compliant' | 'Missing';
type DocumentTypeFilter = 'All' | DocType;
type SortableColumn = 'vehicleRegistration' | 'documentType' | 'expiryDate' | 'status' | 'daysDifference';
type SortDirection = 'asc' | 'desc';

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'All', label: 'All Statuses' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'ExpiringSoon', label: 'Expiring Soon' },
  { value: 'Compliant', label: 'Compliant' },
  { value: 'Missing', label: 'Missing' },
];

const documentTypeOptions: { value: DocumentTypeFilter; label: string }[] = [
  { value: 'All', label: 'All Document Types' },
  ...DOCUMENT_TYPES.map(dt => ({ value: dt, label: dt })),
];

const getStatusConfig = (status: ReportableDocument['status']) => {
  switch (status) {
    case 'Compliant':
      return { icon: CheckCircle2, color: 'text-green-600', badgeVariant: 'default' as const, bgColor: 'bg-green-50' };
    case 'ExpiringSoon':
      return { icon: Clock, color: 'text-yellow-600', badgeVariant: 'secondary' as const, bgColor: 'bg-yellow-50' };
    case 'Overdue':
      return { icon: AlertTriangle, color: 'text-red-600', badgeVariant: 'destructive' as const, bgColor: 'bg-red-50' };
    case 'Missing':
    default:
      return { icon: AlertTriangle, color: 'text-orange-500', badgeVariant: 'outline' as const, bgColor: 'bg-orange-50' };
  }
};

interface ExpiringDocumentsReportClientProps {
  initialDocuments: ReportableDocument[];
  initialStatusFilter: StatusFilter;
  initialDocTypeFilter: DocumentTypeFilter;
  initialSearchTerm: string;
  initialDateRange?: DateRange;
}

export function ExpiringDocumentsReportClient({
  initialDocuments,
  initialStatusFilter,
  initialDocTypeFilter,
  initialSearchTerm,
  initialDateRange,
}: ExpiringDocumentsReportClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams(); // To read any other params or construct new ones
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false); // For client-side actions like CSV download if needed
  
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const [docTypeFilter, setDocTypeFilter] = useState<DocumentTypeFilter>(initialDocTypeFilter);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(initialDateRange);

  const [sortColumn, setSortColumn] = useState<SortableColumn>('daysDifference');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Effect to update URL when server-side filters change
  useEffect(() => {
    const currentParams = new URLSearchParams(searchParams.toString());
    
    if (statusFilter !== (initialStatusFilter)) {
      if (statusFilter === 'All') currentParams.delete('status');
      else currentParams.set('status', statusFilter);
    }
    if (docTypeFilter !== (initialDocTypeFilter)) {
      if (docTypeFilter === 'All') currentParams.delete('docType');
      else currentParams.set('docType', docTypeFilter);
    }
    if (searchTerm !== initialSearchTerm) {
       if (searchTerm) currentParams.set('search', searchTerm); else currentParams.delete('search');
    }
    if (dateRange !== initialDateRange) {
        if (dateRange?.from) currentParams.set('from', format(dateRange.from, 'yyyy-MM-dd')); else currentParams.delete('from');
        if (dateRange?.to) currentParams.set('to', format(dateRange.to, 'yyyy-MM-dd')); else currentParams.delete('to');
    }

    // Only push if params intended for server actually changed or if client-side params changed
    const newQueryString = currentParams.toString();
    const oldQueryString = new URLSearchParams({
        ...(initialStatusFilter !== 'All' && {status: initialStatusFilter}),
        ...(initialDocTypeFilter !== 'All' && {docType: initialDocTypeFilter}),
        ...(initialSearchTerm && {search: initialSearchTerm}),
        ...(initialDateRange?.from && {from: format(initialDateRange.from, 'yyyy-MM-dd')}),
        ...(initialDateRange?.to && {to: format(initialDateRange.to, 'yyyy-MM-dd')}),
    }).toString();


    if (newQueryString !== oldQueryString) {
        router.push(`${pathname}?${newQueryString}`, { scroll: false });
    }
  }, [statusFilter, docTypeFilter, searchTerm, dateRange, router, pathname, searchParams, initialStatusFilter, initialDocTypeFilter, initialSearchTerm, initialDateRange]);


  const clientFilteredDocuments = useMemo(() => {
    let filtered = initialDocuments;

    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(doc => 
        doc.vehicleRegistration.toLowerCase().includes(lowerSearchTerm) ||
        (doc.type === 'Other' && doc.customTypeName?.toLowerCase().includes(lowerSearchTerm)) ||
        doc.type.toLowerCase().includes(lowerSearchTerm)
      );
    }

    if (dateRange?.from || dateRange?.to) {
        filtered = filtered.filter(doc => {
            if (!doc.expiryDate) return false;
            const expiry = parseISO(doc.expiryDate);
            const fromOk = dateRange.from ? expiry >= dateRange.from : true;
            const toOk = dateRange.to ? expiry <= dateRange.to : true;
            return fromOk && toOk;
        });
    }
    return filtered;
  }, [initialDocuments, searchTerm, dateRange]);


  const sortedDocuments = useMemo(() => {
    return [...clientFilteredDocuments].sort((a, b) => {
      let valA: any = a[sortColumn];
      let valB: any = b[sortColumn];

      if (sortColumn === 'expiryDate') {
        valA = a.expiryDate ? parseISO(a.expiryDate).getTime() : (sortDirection === 'asc' ? Infinity : -Infinity);
        valB = b.expiryDate ? parseISO(b.expiryDate).getTime() : (sortDirection === 'asc' ? Infinity : -Infinity);
      } else if (sortColumn === 'daysDifference') {
        valA = a.expiryDate ? a.daysDifference : (sortDirection === 'asc' ? Infinity : -Infinity);
        valB = b.expiryDate ? b.daysDifference : (sortDirection === 'asc' ? Infinity : -Infinity);
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      } else if (valA === null || valA === undefined) {
        return sortDirection === 'asc' ? 1 : -1;
      } else if (valB === null || valB === undefined) {
        return sortDirection === 'asc' ? -1 : 1;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [clientFilteredDocuments, sortColumn, sortDirection]);

  const handleSort = (column: SortableColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'expiryDate' || column === 'daysDifference' ? 'asc' : 'asc');
    }
  };

  const clearFilters = () => {
    // These will trigger the useEffect to update URL
    setStatusFilter('ExpiringSoon'); 
    setDocTypeFilter('All');
    setSearchTerm('');
    setDateRange(undefined);
  };
  
  const downloadCSV = async () => {
    if (sortedDocuments.length === 0) {
      toast({ title: "No Data", description: "No data available to export with current filters.", variant: "default" });
      return;
    }
    setIsLoading(true);
    const headers = ["Vehicle Registration", "Document Type", "Custom Type Name", "Expiry Date", "Status", "Days Until/Past Due", "Document ID", "Vehicle ID"];
    const csvRows = [
      headers.join(','),
      ...sortedDocuments.map(doc => [
        `"${doc.vehicleRegistration}"`,
        `"${doc.type}"`,
        `"${doc.customTypeName || ''}"`,
        `"${doc.expiryDate ? format(parseISO(doc.expiryDate), DATE_FORMAT) : 'N/A'}"`,
        `"${doc.status}"`,
        doc.expiryDate ? (doc.daysDifference < 0 ? `${Math.abs(doc.daysDifference)} overdue` : `${doc.daysDifference} left`) : 'N/A',
        `"${doc.id}"`,
        `"${doc.vehicleId}"`,
      ].join(','))
    ];
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `document_compliance_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Export Successful", description: "CSV report downloaded."});
      await recordCsvExportAudit('ExpiringDocuments', 'CSV', { 
          statusFilter: initialStatusFilter, // Log the server-fetched filter
          docTypeFilter: initialDocTypeFilter, // Log the server-fetched filter
          searchTerm, // Log current client-side search term
          dateRange: dateRange ? {from: dateRange.from && format(dateRange.from, 'yyyy-MM-dd'), to: dateRange.to && format(dateRange.to, 'yyyy-MM-dd')} : undefined 
      });
    }
    setIsLoading(false);
  };

  const renderSortIcon = (column: SortableColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30 group-hover:opacity-100" />;
    return sortDirection === 'asc' ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />;
  };
  
  // Synchronize local state if initial props change (e.g., direct navigation with new query params)
  useEffect(() => {
    setStatusFilter(initialStatusFilter);
    setDocTypeFilter(initialDocTypeFilter);
    setSearchTerm(initialSearchTerm);
    setDateRange(initialDateRange);
  }, [initialStatusFilter, initialDocTypeFilter, initialSearchTerm, initialDateRange]);


  return (
    <>
    <div className="flex justify-end mb-4">
        <Button onClick={downloadCSV} variant="outline" disabled={isLoading || sortedDocuments.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
    </div>
    <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Filter & View Documents</CardTitle>
          <CardDescription>
            Filter documents by status, type, expiry date range, or search. Default view shows documents expiring soon. Server filters for Status and Type, client for Search and Date Range.
          </CardDescription>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger><SelectValue placeholder="Filter by Status" /></SelectTrigger>
              <SelectContent>{statusOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={docTypeFilter} onValueChange={(value) => setDocTypeFilter(value as DocumentTypeFilter)}>
              <SelectTrigger><SelectValue placeholder="Filter by Document Type" /></SelectTrigger>
              <SelectContent>{documentTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
            </Select>
            <Popover>
                <PopoverTrigger asChild>
                    <Button id="date" variant={"outline"} className={cn("justify-start text-left font-normal h-10",!dateRange && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>) : (format(dateRange.from, "LLL dd, y"))) : (<span>Pick expiry date range</span>)}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2}/>
                </PopoverContent>
            </Popover>
            <div className="relative flex-grow lg:col-span-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="search" placeholder="Search Reg No, Doc Type..." className="pl-8 w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
            </div>
          </div>
           <div className="pt-2">
                <Button variant="outline" onClick={clearFilters} size="sm">
                <FilterX className="mr-2 h-4 w-4" /> Clear All Filters
                </Button>
            </div>
        </CardHeader>
        <CardContent>
          {initialDocuments.length === 0 && searchTerm === '' && !dateRange?.from && !dateRange?.to ? ( // Check if server returned no docs and no client filters applied
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="mx-auto h-16 w-16 mb-4" />
              <p className="text-xl font-semibold">No documents match the server filters.</p>
              <p>Try adjusting Status or Document Type filters.</p>
            </div>
          ) : sortedDocuments.length === 0 ? (
             <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="mx-auto h-16 w-16 mb-4" />
              <p className="text-xl font-semibold">No documents match your current client-side filters (Search/Date Range).</p>
              <p>Try adjusting your search or date range criteria, or broaden server filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleSort('vehicleRegistration')} className="cursor-pointer hover:bg-muted/50 group">
                    <div className="flex items-center">Vehicle Reg. {renderSortIcon('vehicleRegistration')}</div>
                  </TableHead>
                  <TableHead onClick={() => handleSort('documentType')} className="cursor-pointer hover:bg-muted/50 group">
                     <div className="flex items-center">Doc Type {renderSortIcon('documentType')}</div>
                  </TableHead>
                  <TableHead onClick={() => handleSort('expiryDate')} className="cursor-pointer hover:bg-muted/50 group">
                     <div className="flex items-center">Expiry Date {renderSortIcon('expiryDate')}</div>
                  </TableHead>
                  <TableHead onClick={() => handleSort('status')} className="cursor-pointer hover:bg-muted/50 group">
                    <div className="flex items-center">Status {renderSortIcon('status')}</div>
                  </TableHead>
                  <TableHead onClick={() => handleSort('daysDifference')} className="text-right cursor-pointer hover:bg-muted/50 group">
                    <div className="flex items-center justify-end">Days Rem./Past {renderSortIcon('daysDifference')}</div>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDocuments.map((doc) => {
                  const config = getStatusConfig(doc.status);
                  const StatusIcon = config.icon;
                  return (
                    <TableRow key={doc.id} className={cn(config.bgColor?.replace('bg-','hover:bg-opacity-80 hover:'))}>
                      <TableCell className="font-medium">
                        <Link href={`/vehicles/${doc.vehicleId}`} className="text-primary hover:underline">
                          {doc.vehicleRegistration}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {doc.type === 'Other' && doc.customTypeName ? doc.customTypeName : doc.type}
                      </TableCell>
                      <TableCell>
                        {doc.expiryDate ? format(parseISO(doc.expiryDate), DATE_FORMAT) : <span className="text-muted-foreground italic">Not Set</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.badgeVariant} className={cn(
                           "text-xs",
                           doc.status === 'ExpiringSoon' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : '',
                           doc.status === 'Compliant' ? 'bg-green-100 text-green-800 border-green-300' : ''
                        )}>
                          <StatusIcon className={cn("mr-1 h-3 w-3", config.color)} />
                          {doc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn("text-right text-xs", {
                        'text-red-600 font-semibold': doc.daysDifference < 0 && doc.expiryDate,
                        'text-yellow-600 font-semibold': doc.expiryDate && doc.daysDifference >= 0 && doc.daysDifference <= EXPIRY_WARNING_DAYS,
                      })}>
                        {doc.expiryDate ? (doc.daysDifference < 0 ? `${Math.abs(doc.daysDifference)} days overdue` : `${doc.daysDifference} days left`) : '-'}
                      </TableCell>
                       <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/vehicles/${doc.vehicleId}?scrollToDoc=${doc.id}`}>View Vehicle</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
