
import { notFound } from 'next/navigation';
import { getVehicleById } from '@/lib/data';
import { getDocumentComplianceStatus, getLatestDocumentForType } from '@/lib/utils'; // Updated import
import type { Vehicle, VehicleDocument, DocumentType as VehicleDocumentType } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Car, CalendarDays, FileText, UploadCloud, Edit, Trash2, AlertTriangle, CheckCircle2, Clock, Loader2, History, Info, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { DATE_FORMAT } from '@/lib/constants';
import React from 'react';
import { extractExpiryDate } from '@/ai/flows/extract-expiry-date';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { VehicleDocumentManager } from '@/components/vehicle/vehicle-document-manager'; // New Client Component

type VehicleDetailPageProps = {
  params: { id: string };
};

type DisplayStatus = 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'Missing' | 'Superseded';
interface DisplayStatusConfig {
  icon: React.ElementType;
  color: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  bgColor?: string;
}

const baseStatusConfig = (status: VehicleDocument['status']): DisplayStatusConfig => {
  switch (status) {
    case 'Compliant':
      return { icon: CheckCircle2, color: 'text-green-600', badgeVariant: 'default', bgColor: 'bg-green-50' };
    case 'ExpiringSoon':
      return { icon: Clock, color: 'text-yellow-600', badgeVariant: 'secondary', bgColor: 'bg-yellow-50' };
    case 'Overdue':
      return { icon: AlertTriangle, color: 'text-red-600', badgeVariant: 'destructive', bgColor: 'bg-red-50' };
    case 'Missing':
    default:
      return { icon: AlertTriangle, color: 'text-orange-500', badgeVariant: 'outline', bgColor: 'bg-orange-50' };
  }
};

const getEffectiveDocDisplayConfig = (
  doc: VehicleDocument,
  allVehicleDocuments: VehicleDocument[],
  vehicleId: string
): { text: DisplayStatus; config: DisplayStatusConfig } => {
  const rawStatus = getDocumentComplianceStatus(doc.expiryDate);

  if (rawStatus === 'Compliant' || rawStatus === 'ExpiringSoon') {
    return { text: rawStatus, config: baseStatusConfig(rawStatus) };
  }
  if (rawStatus === 'Missing' && !doc.expiryDate) {
    return { text: 'Missing', config: baseStatusConfig('Missing') };
  }

  const latestActiveDocOfSameType = getLatestDocumentForType(
      { id: vehicleId, documents: allVehicleDocuments } as Vehicle, // Pass a minimal vehicle-like structure
      doc.type,
      doc.customTypeName
  );

  if (latestActiveDocOfSameType && latestActiveDocOfSameType.id !== doc.id) {
      const statusOfLatest = getDocumentComplianceStatus(latestActiveDocOfSameType.expiryDate);
      if (statusOfLatest === 'Compliant' || statusOfLatest === 'ExpiringSoon') {
          return {
              text: 'Superseded',
              config: { icon: History, color: 'text-gray-500', badgeVariant: 'outline', bgColor: 'bg-gray-50 hover:bg-gray-100' }
          };
      }
  }
  return { text: rawStatus, config: baseStatusConfig(rawStatus) };
};


export default async function VehicleDetailPage({ params }: VehicleDetailPageProps) {
  const vehicleId = params.id;
  const vehicle = await getVehicleById(vehicleId);

  if (!vehicle) {
    notFound();
  }

  const documentsByType: Record<string, VehicleDocument[]> = {};
  vehicle.documents.forEach(doc => {
    const key = doc.type === 'Other' && doc.customTypeName ? `${doc.type} (${doc.customTypeName})` : doc.type;
    if (!documentsByType[key]) {
      documentsByType[key] = [];
    }
    documentsByType[key].push(doc);
  });
  for (const key in documentsByType) {
    documentsByType[key].sort((a,b) => parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime());
  }

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
            <Car className="h-10 w-10 text-primary" />
            <div>
                <h1 className="text-3xl font-bold font-headline">{vehicle.registrationNumber}</h1>
                <p className="text-muted-foreground">{vehicle.make} {vehicle.model} - {vehicle.type}</p>
            </div>
        </div>
        <div className="flex gap-2">
            <Link href={`/vehicles/${vehicle.id}/edit`}>
                <Button variant="outline"><Edit className="mr-2 h-4 w-4" /> Edit Vehicle</Button>
            </Link>
            {/* Document upload button moved to VehicleDocumentManager */}
        </div>
      </div>
      
      {/* VehicleDocumentManager will handle the upload button and modal */}
      <VehicleDocumentManager vehicle={vehicle} extractExpiryDateFn={extractExpiryDate} />

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Vehicle Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><span className="font-medium">Registration:</span> {vehicle.registrationNumber}</div>
          <div><span className="font-medium">Type:</span> {vehicle.type}</div>
          <div><span className="font-medium">Make:</span> {vehicle.make}</div>
          <div><span className="font-medium">Model:</span> {vehicle.model}</div>
          <div><span className="font-medium">Added On:</span> {format(parseISO(vehicle.createdAt), DATE_FORMAT)}</div>
          <div><span className="font-medium">Last Updated:</span> {format(parseISO(vehicle.updatedAt), DATE_FORMAT)}</div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline flex items-center"><History className="mr-2 h-5 w-5" />Compliance Document History</CardTitle>
          <CardDescription>View and manage all historical and current documents for this vehicle. Document files are not stored; only metadata is retained.</CardDescription>
        </CardHeader>
        <CardContent>
          {vehicle.documents.filter(d => d.status !== 'Missing' || d.expiryDate).length > 0 ? (
            Object.entries(documentsByType).map(([docTypeKey, docs]) => (
              <div key={docTypeKey} className="mb-6">
                <h3 className="text-md font-semibold mb-2 capitalize border-b pb-1">{docTypeKey.toLowerCase()}</h3>
                <ScrollArea className={cn("max-h-[400px]", docs.length > 4 ? "h-[400px]" : "")}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[15%]">Policy/Doc #</TableHead>
                        <TableHead className="w-[15%]">Validity Period</TableHead>
                        <TableHead className="w-[12%]">Status</TableHead>
                        <TableHead className="w-[15%]">File Name / Uploaded</TableHead>
                        <TableHead className="w-[10%]">AI Info</TableHead>
                        <TableHead className="text-right w-[13%]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {docs.map((doc) => {
                        const { text: statusText, config: displayConfig } = getEffectiveDocDisplayConfig(doc, vehicle.documents, vehicle.id);
                        const StatusIcon = displayConfig.icon;
                        const hasAiInfo = doc.aiExtractedPolicyNumber || doc.aiExtractedStartDate || doc.aiExtractedDate;
                        return (
                          <TableRow key={doc.id} className={cn(displayConfig.bgColor?.replace('bg-','hover:bg-opacity-80 hover:'), doc.status === "Missing" && !doc.expiryDate ? "opacity-50" : "")}>
                            <TableCell className="text-xs font-medium">
                                {doc.policyNumber || <span className="text-muted-foreground italic">N/A</span>}
                            </TableCell>
                            <TableCell className="text-xs">
                              {doc.startDate ? format(parseISO(doc.startDate), DATE_FORMAT) : <span className="text-muted-foreground italic">N/A</span>}
                              {' - '}
                              {doc.expiryDate ? format(parseISO(doc.expiryDate), DATE_FORMAT) : <span className="text-muted-foreground italic">N/A</span>}
                            </TableCell>
                            <TableCell>
                              <Badge variant={displayConfig.badgeVariant} className={cn(
                                "text-xs",
                                statusText === 'ExpiringSoon' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : '',
                                statusText === 'Compliant' ? 'bg-green-100 text-green-800 border-green-300' : '',
                                statusText === 'Superseded' ? 'bg-gray-100 text-gray-700 border-gray-300' : ''
                              )}>
                                <StatusIcon className={cn("mr-1 h-3 w-3", displayConfig.color)} />
                                {statusText}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                                {doc.documentName ? (
                                     <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="truncate block max-w-[120px] hover:underline">{doc.documentName}</span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" align="start"><p>{doc.documentName}</p></TooltipContent>
                                     </Tooltip>
                                ) : (
                                    <span className="text-muted-foreground italic">No file name</span>
                                )}
                                <p className="text-muted-foreground text-[10px]">
                                    {format(parseISO(doc.uploadedAt), `${DATE_FORMAT} HH:mm`)}
                                </p>
                            </TableCell>
                            <TableCell className="text-xs">
                                {hasAiInfo ? (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="ghost" size="sm" className="p-0 h-auto text-xs"><Info className="h-3 w-3 text-blue-500"/></Button>
                                        </TooltipTrigger>
                                        <TooltipContent className="text-xs">
                                            <p className="font-semibold mb-1">AI Extracted:</p>
                                            {doc.aiExtractedPolicyNumber && <div>Policy #: {doc.aiExtractedPolicyNumber} (Conf: {doc.aiPolicyNumberConfidence?.toFixed(2) ?? 'N/A'})</div>}
                                            {doc.aiExtractedStartDate && <div>Start: {format(parseISO(doc.aiExtractedStartDate), DATE_FORMAT)} (Conf: {doc.aiStartDateConfidence?.toFixed(2) ?? 'N/A'})</div>}
                                            {doc.aiExtractedDate && <div>Expiry: {format(parseISO(doc.aiExtractedDate), DATE_FORMAT)} (Conf: {doc.aiConfidence?.toFixed(2) ?? 'N/A'})</div>}
                                        </TooltipContent>
                                    </Tooltip>
                                ) : (
                                    <span className="text-muted-foreground">-</span>
                                )}
                            </TableCell>
                            <TableCell className="text-right">
                              {doc.documentUrl ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" asChild className="h-7 w-7">
                                      <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer" aria-label="View document (opens mock link)">
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>View Document (Mock Link)</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                 <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
                                        <ExternalLink className="h-4 w-4 opacity-50" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>No document link available</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-4" />
              <p>No documents uploaded for this vehicle yet.</p>
              <p>Click "Upload New Document" to add the first one.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal is now managed by VehicleDocumentManager */}
    </div>
    </TooltipProvider>
  );
}
