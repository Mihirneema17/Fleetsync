"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { getReportableDocuments } from '@/lib/data';
import type { ReportableDocument, DocumentType as DocType } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { ClipboardList, AlertTriangle, Clock, CheckCircle2, Search, FilterX, Car } from 'lucide-react';
import { DOCUMENT_TYPES, DATE_FORMAT } from '@/lib/constants';

type StatusFilter = 'All' | 'Overdue' | 'ExpiringSoon' | 'Compliant' | 'Missing';
type DocumentTypeFilter = 'All' | DocType;

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
  const searchParams = useSearchParams();
  const router = useRouter();

  const [documents, setDocuments] = useState<ReportableDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(searchParams.get('status') as StatusFilter || 'All');
  const [docTypeFilter, setDocTypeFilter] = useState<DocumentTypeFilter>(searchParams.get('docType') as DocumentTypeFilter || 'All');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const statusesToFetch: Array<'Overdue' | 'ExpiringSoon' | 'Compliant' | 'Missing'> | undefined = 
        statusFilter === 'All' ? ['Overdue', 'ExpiringSoon', 'Compliant', 'Missing'] : [statusFilter as 'Overdue' | 'ExpiringSoon' | 'Compliant' | 'Missing'];
      
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
  }, [statusFilter, docTypeFilter]); // Re-fetch when filters change server-side

  const handleFilterChange = (filterType: 'status' | 'docType' | 'search', value: string) => {
    const currentParams = new URLSearchParams(Array.from(searchParams.entries()));
    if (value && value !== 'All') {
      currentParams.set(filterType, value);
    } else {
      currentParams.delete(filterType);
    }
    router.push(`/reports/expiring-documents?${currentParams.toString()}`);
    // State will be updated by useEffect listening to searchParams changes for status and docType.
    // For searchTerm, it's client-side filtering after fetch.
     if (filterType === 'status') setStatusFilter(value as StatusFilter);
     if (filterType === 'docType') setDocTypeFilter(value as DocumentTypeFilter);
     if (filterType === 'search') setSearchTerm(value);
  };
  
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => 
      doc.vehicleRegistration.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.type === 'Other' && doc.customTypeName?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      doc.type.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [documents, searchTerm]);

  const clearFilters = () => {
    router.push('/reports/expiring-documents');
    setStatusFilter('All');
    setDocTypeFilter('All');
    setSearchTerm('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-headline flex items-center">
          <ClipboardList className="mr-3 h-8 w-8 text-primary" />
          Document Compliance Report
        </h1>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Filter Documents</CardTitle>
          <CardDescription>
            View documents by status, type, or search by vehicle registration. Defaults to showing Overdue and Expiring Soon.
          </CardDescription>
          <div className="flex flex-col md:flex-row gap-4 pt-4">
            <Select value={statusFilter} onValueChange={(value) => handleFilterChange('status', value)}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={docTypeFilter} onValueChange={(value) => handleFilterChange('docType', value)}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filter by Document Type" />
              </SelectTrigger>
              <SelectContent>
                {documentTypeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-grow">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by Reg No, Doc Type..."
                className="pl-8 w-full"
                value={searchTerm}
                onChange={(e) => handleFilterChange('search', e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={clearFilters} className="w-full md:w-auto">
              <FilterX className="mr-2 h-4 w-4" /> Clear Filters
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Car className="w-12 h-12 animate-pulse text-primary" />
              <p className="ml-4 text-lg text-muted-foreground">Loading documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="mx-auto h-16 w-16 mb-4" />
              <p className="text-xl font-semibold">No documents match your current filters.</p>
              <p>Try adjusting your search or filter criteria.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle Reg.</TableHead>
                  <TableHead>Document Type</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Days Until / Past Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => {
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
                        'text-red-600 font-semibold': doc.daysDifference < 0,
                        'text-yellow-600 font-semibold': doc.daysDifference >= 0 && doc.daysDifference < 30,
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
