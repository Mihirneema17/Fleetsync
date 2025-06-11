
import Link from 'next/link';
import { getReportableDocuments, recordCsvExportAudit } from '@/lib/data';
import type { ReportableDocument, DocumentType as DocType } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList, Download } from 'lucide-react';
import { ExpiringDocumentsReportClient } from '@/components/report/expiring-documents-client';
import { format, parseISO, isValid } from 'date-fns';

type StatusFilter = 'All' | 'Overdue' | 'ExpiringSoon' | 'Compliant' | 'Missing';
type DocumentTypeFilter = 'All' | DocType;

interface ExpiringDocumentsReportPageProps {
  searchParams: {
    status?: StatusFilter;
    docType?: DocumentTypeFilter;
    search?: string;
    from?: string;
    to?: string;
  };
}

// This page is now a Server Component
export default async function ExpiringDocumentsReportPage({ searchParams }: ExpiringDocumentsReportPageProps) {
  const statusFilter = searchParams.status || 'ExpiringSoon'; // Default to ExpiringSoon
  const docTypeFilter = searchParams.docType || 'All';
  const searchTerm = searchParams.search || '';
  const dateRangeFrom = searchParams.from && isValid(parseISO(searchParams.from)) ? parseISO(searchParams.from) : undefined;
  const dateRangeTo = searchParams.to && isValid(parseISO(searchParams.to)) ? parseISO(searchParams.to) : undefined;

  const statusesToFetch: Array<'Overdue' | 'ExpiringSoon' | 'Compliant' | 'Missing'> | undefined =
    statusFilter === 'All' ? undefined : [statusFilter as 'Overdue' | 'ExpiringSoon' | 'Compliant' | 'Missing'];
  
  const docTypesToFetch: DocType[] | undefined =
    docTypeFilter === 'All' ? undefined : [docTypeFilter as DocType];

  const documents = await getReportableDocuments({
    statuses: statusesToFetch,
    documentTypes: docTypesToFetch,
  });

  // Log the view event on the server side
  await recordCsvExportAudit('ExpiringDocuments', 'VIEW', { 
    statusFilter, 
    docTypeFilter,
    // Note: searchTerm and dateRange are client-side filters on the fetched data,
    // so they are not part of the server-side fetch parameters here for the audit log of 'VIEW'.
    // If we wanted to log exactly what the user *sees* after client-side filtering,
    // that would need a client-side log event.
  });

  const initialDateRange = dateRangeFrom || dateRangeTo ? { from: dateRangeFrom, to: dateRangeTo } : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-headline flex items-center">
          <ClipboardList className="mr-3 h-8 w-8 text-primary" />
          Document Compliance Report
        </h1>
        {/* Export CSV button is now part of the client component */}
      </div>

      <ExpiringDocumentsReportClient
        initialDocuments={documents}
        initialStatusFilter={statusFilter}
        initialDocTypeFilter={docTypeFilter}
        initialSearchTerm={searchTerm}
        initialDateRange={initialDateRange}
      />
    </div>
  );
}
