
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { getReportableDocuments, recordCsvExportAudit } from '@/lib/data';
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
import { ClipboardList, AlertTriangle, Clock, CheckCircle2, Search, FilterX, Car, Download, CalendarIcon, ArrowUpDown } from 'lucide-react';
import { DOCUMENT_TYPES, DATE_FORMAT } from '@/lib/constants';
import type { DateRange } from "react-day-picker";

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


export default function ExpiringDocumentsReportPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [documents, setDocuments] = useState<ReportableDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters from URL state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(searchParams.get('status') as StatusFilter || 'ExpiringSoon'); // Default to ExpiringSoon
  const [docTypeFilter, setDocTypeFilter] = useState<DocumentTypeFilter>(searchParams.get('docType') as DocumentTypeFilter || 'All');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: searchParams.get('from') ? parseISO(searchParams.get('from')!) : undefined,
    to: searchParams.get('to') ? parseISO(searchParams.get('to')!) : undefined,
  });

  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortableColumn>('daysDifference');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const updateUrlParams = useCallback(() => {
    const currentParams = new URLSearchParams();
    if (statusFilter !== 'All') currentParams.set('status', statusFilter);
    if (docTypeFilter !== 'All') currentParams.set('docType', docTypeFilter);
    if (searchTerm) currentParams.set('search', searchTerm);
    if (dateRange?.from) currentParams.set('from', format(dateRange.from, 'yyyy-MM-dd'));
    if (dateRange?.to) currentParams.set('to', format(dateRange.to, 'yyyy-MM-dd'));
    router.push(`${pathname}?${currentParams.toString()}`);
  }, [statusFilter, docTypeFilter, searchTerm, dateRange, router, pathname]);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const statusesToFetch: Array<'Overdue' | 'ExpiringSoon' | 'Compliant' | 'Missing'> | undefined = 
        statusFilter === 'All' ? undefined : [statusFilter as 'Overdue' | 'ExpiringSoon' | 'Compliant' | 'Missing'];
      
      const docTypesToFetch: DocType[] | undefined = 
        docTypeFilter === 'All' ? undefined : [docTypeFilter as DocType];

      const fetchedDocs = await getReportableDocuments({ 
        statuses: statusesToFetch, 
        documentTypes: docTypesToFetch 
      });
      setDocuments(fetchedDocs);
      setIsLoading(false);
    }
    fetchData();
  }, [statusFilter, docTypeFilter]); // Server-side filters

  // Client-side filtering (search and date range)
  const clientFilteredDocuments = useMemo(() => {
    let filtered = documents;

    if (searchTerm) {
      filtered = filtered.filter(doc => 
        doc.vehicleRegistration.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (doc.type === 'Other' && doc.customTypeName?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        doc.type.toLowerCase().includes(searchTerm.toLowerCase())
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
  }, [documents, searchTerm, dateRange]);


  // Client-side sorting
  const sortedDocuments = useMemo(() => {
    return [...clientFilteredDocuments].sort((a, b) => {
      let valA: any = a[sortColumn];
      let valB: any = b[sortColumn];

      if (sortColumn === 'expiryDate') {
        valA = a.expiryDate ? parseISO(a.expiryDate).getTime() : (sortDirection === 'asc' ? Infinity : -Infinity);
        valB = b.expiryDate ? parseISO(b.expiryDate).getTime() : (sortDirection === 'asc' ? Infinity : -Infinity);
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
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
      setSortDirection('asc');
    }
  };

  const clearFilters = () => {
    setStatusFilter('ExpiringSoon');
    setDocTypeFilter('All');
    setSearchTerm('');
    setDateRange(undefined);
    router.push(pathname || '/reports/expiring-documents'); // Go to base path to clear URL
  };
  
  useEffect(() => {
    // This effect runs when any of the filter states change, updating the URL.
    updateUrlParams();
  }, [updateUrlParams]);


  const downloadCSV = async () => {
    if (sortedDocuments.length === 0) {
      alert("No data to export.");
      return;
    }
    const headers = ["Vehicle Registration", "Document Type", "Custom Type Name", "Expiry Date", "Status", "Days Difference", "Document ID", "Vehicle ID"];
    const csvRows = [
      headers.join(','),
      ...sortedDocuments.map(doc => [
        `"${doc.vehicleRegistration}"`,
        `"${doc.type}"`,
        `"${doc.customTypeName || ''}"`,
        `"${doc.expiryDate ? format(parseISO(doc.expiryDate), DATE_FORMAT) : 'N/A'}"`,
        `"${doc.status}"`,
        doc.expiryDate ? doc.daysDifference : 'N/A',
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
      await recordCsvExportAudit('ExpiringDocuments', 'CSV', { statusFilter, docTypeFilter, searchTerm, dateRange });
    }
  };

  const renderSortIcon = (column: SortableColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-3 w-3 opacity-30" />;
    return sortDirection === 'asc' ? <ArrowUpDown className="ml-2 h-3 w-3" /> : <ArrowUpDown className="ml-2 h-3 w-3" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-headline flex items-center">
          <ClipboardList className="mr-3 h-8 w-8 text-primary" />
          Document Compliance Report
        </h1>
        <Button onClick={downloadCSV} variant="outline">
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Filter & View Documents</CardTitle>
          <CardDescription>
            Filter documents by status, type, expiry date range, or search. Default view shows documents expiring soon.
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
                    <Button
                    id="date"
                    variant={"outline"}
                    className={cn(
                        "justify-start text-left font-normal h-10", // Ensure height matches other inputs
                        !dateRange && "text-muted-foreground"
                    )}
                    >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                        dateRange.to ? (
                        <>
                            {format(dateRange.from, "LLL dd, y")} -{" "}
                            {format(dateRange.to, "LLL dd, y")}
                        </>
                        ) : (
                        format(dateRange.from, "LLL dd, y")
                        )
                    ) : (
                        <span>Pick expiry date range</span>
                    )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                    />
                </PopoverContent>
            </Popover>
            <div className="relative flex-grow lg:col-span-1"> {/* Adjusted for better layout */}
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search Reg No, Doc Type..."
                className="pl-8 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
           <div className="pt-2">
                <Button variant="outline" onClick={clearFilters} size="sm">
                <FilterX className="mr-2 h-4 w-4" /> Clear All Filters
                </Button>
            </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Car className="w-12 h-12 animate-pulse text-primary" />
              <p className="ml-4 text-lg text-muted-foreground">Loading documents...</p>
            </div>
          ) : sortedDocuments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="mx-auto h-16 w-16 mb-4" />
              <p className="text-xl font-semibold">No documents match your current filters.</p>
              <p>Try adjusting your search or filter criteria.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleSort('vehicleRegistration')} className="cursor-pointer hover:bg-muted/50">
                    Vehicle Reg. {renderSortIcon('vehicleRegistration')}
                  </TableHead>
                  <TableHead onClick={() => handleSort('documentType')} className="cursor-pointer hover:bg-muted/50">
                    Doc Type {renderSortIcon('documentType')}
                  </TableHead>
                  <TableHead onClick={() => handleSort('expiryDate')} className="cursor-pointer hover:bg-muted/50">
                    Expiry Date {renderSortIcon('expiryDate')}
                  </TableHead>
                  <TableHead onClick={() => handleSort('status')} className="cursor-pointer hover:bg-muted/50">
                    Status {renderSortIcon('status')}
                  </TableHead>
                  <TableHead onClick={() => handleSort('daysDifference')} className="text-right cursor-pointer hover:bg-muted/50">
                    Days Until/Past {renderSortIcon('daysDifference')}
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
                           doc.status === 'ExpiringSoon' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : '',
                           doc.status === 'Compliant' ? 'bg-green-100 text-green-800 border-green-300' : ''
                        )}>
                          <StatusIcon className={cn("mr-1 h-3 w-3", config.color)} />
                          {doc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn("text-right", {
                        'text-red-600 font-semibold': doc.daysDifference < 0 && doc.expiryDate,
                        'text-yellow-600 font-semibold': doc.expiryDate && doc.daysDifference >= 0 && doc.daysDifference < 30,
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

