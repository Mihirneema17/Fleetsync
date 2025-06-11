
"use client";
import { notFound, useRouter } from 'next/navigation';
import { getVehicleById, getDocumentComplianceStatus, addOrUpdateDocument, getLatestDocumentForType } from '@/lib/data';
import type { Vehicle, VehicleDocument, DocumentType as VehicleDocumentType } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Car, CalendarDays, FileText, UploadCloud, Edit, Trash2, AlertTriangle, CheckCircle2, Clock, Loader2, History, Info } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { DATE_FORMAT, AI_SUPPORTED_DOCUMENT_TYPES } from '@/lib/constants';
import React, { useState, useEffect, use } from 'react';
import { DocumentUploadModal } from '@/components/document/document-upload-modal';
import { useToast } from '@/hooks/use-toast';
import { extractExpiryDate } from '@/ai/flows/extract-expiry-date';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


type VehicleDetailPageProps = {
  params: { id: string } | Promise<{ id: string }>;
};

type DisplayStatus = 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'Missing' | 'Superseded';
interface DisplayStatusConfig {
  icon: React.ElementType;
  color: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  bgColor?: string; // Optional background color for the row
}


export default function VehicleDetailPage({ params: paramsProp }: VehicleDetailPageProps) {
  const resolvedParams = typeof (paramsProp as Promise<{id: string}>)?.then === 'function'
    ? use(paramsProp as Promise<{id: string}>)
    : paramsProp as {id: string};

  const { id: vehicleId } = resolvedParams;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDocumentContext, setEditingDocumentContext] = useState<Partial<VehicleDocument> | { type: VehicleDocumentType } | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (vehicleId) {
      async function fetchVehicle() {
        setIsLoading(true);
        const fetchedVehicle = await getVehicleById(vehicleId);
        if (!fetchedVehicle) {
          notFound();
        } else {
          setVehicle(fetchedVehicle);
        }
        setIsLoading(false);
      }
      fetchVehicle();
    }
  }, [vehicleId]);

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
    allVehicleDocuments: VehicleDocument[]
  ): { text: DisplayStatus; config: DisplayStatusConfig } => {
    const rawStatus = getDocumentComplianceStatus(doc.expiryDate);
  
    if (rawStatus === 'Compliant' || rawStatus === 'ExpiringSoon') {
      return { text: rawStatus, config: baseStatusConfig(rawStatus) };
    }
    if (rawStatus === 'Missing' && !doc.expiryDate) {
      return { text: 'Missing', config: baseStatusConfig('Missing') };
    }
  
    // At this point, rawStatus is 'Overdue' (or 'Missing' but with an expiry date, making it effectively Overdue)
    
    // Check if this document itself is the latest active document of its type.
    // If it is, then its rawStatus ('Overdue') is the correct one to display.
    const latestActiveDocOfSameType = getLatestDocumentForType(
        { id: vehicleId, documents: allVehicleDocuments } as Vehicle, // Pass a minimal vehicle-like structure
        doc.type, 
        doc.customTypeName
    );
        
    if (latestActiveDocOfSameType && latestActiveDocOfSameType.id !== doc.id) {
        // This 'doc' is not the latest active one.
        // If the actual latest active one is 'Compliant' or 'ExpiringSoon', then this 'doc' is 'Superseded'.
        const statusOfLatest = getDocumentComplianceStatus(latestActiveDocOfSameType.expiryDate);
        if (statusOfLatest === 'Compliant' || statusOfLatest === 'ExpiringSoon') {
            return { 
                text: 'Superseded', 
                config: { icon: History, color: 'text-gray-500', badgeVariant: 'outline', bgColor: 'bg-gray-50 hover:bg-gray-100' } 
            };
        }
    }
  
    // If this doc is Overdue and it IS the latest active, or if there's no newer active one,
    // or if the newer one is also problematic, then this doc's 'Overdue' status stands.
    return { text: rawStatus, config: baseStatusConfig(rawStatus) };
  };


  const handleOpenUploadModal = (docContext?: Partial<VehicleDocument> | { type: VehicleDocumentType }) => {
    setEditingDocumentContext(docContext || { type: 'Insurance' });
    setIsModalOpen(true);
  };

  const handleDocumentSubmit = async (
    data: {
      documentType: VehicleDocumentType;
      customTypeName?: string;
      policyNumber?: string | null;
      startDate?: string | null; // ISO string
      expiryDate: string | null; // ISO string
      documentFile?: File; 
      documentName?: string; 
      documentUrl?: string;  
    },
    aiExtractedPolicyNumber?: string | null,
    aiPolicyNumberConfidence?: number | null,
    aiExtractedStartDate?: string | null,
    aiStartDateConfidence?: number | null,
    aiExtractedExpiryDate?: string | null,
    aiExpiryDateConfidence?: number | null
  ) => {
    if (!vehicle) return;
    try {
      const updatedVehicle = await addOrUpdateDocument(vehicle.id, {
        type: data.documentType,
        customTypeName: data.customTypeName,
        policyNumber: data.policyNumber,
        startDate: data.startDate,
        expiryDate: data.expiryDate,
        documentName: data.documentName, 
        documentUrl: data.documentUrl,   
        aiExtractedPolicyNumber,
        aiPolicyNumberConfidence,
        aiExtractedStartDate,
        aiStartDateConfidence,
        aiExtractedDate: aiExtractedExpiryDate,
        aiConfidence: aiExpiryDateConfidence,
      });
      if (updatedVehicle) {
        setVehicle(updatedVehicle);
        toast({ title: 'Success', description: `Document for ${data.documentType} added successfully.` });
      } else {
        throw new Error('Failed to update vehicle from server');
      }
      setIsModalOpen(false);
      setEditingDocumentContext(null);
      router.refresh();
    } catch (error) {
      console.error('Failed to submit document:', error);
      toast({ title: 'Error', description: 'Failed to save document. Please try again.', variant: 'destructive' });
    }
  };


  if (isLoading || !vehicle) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
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
            <Button onClick={() => handleOpenUploadModal()}>
                <UploadCloud className="mr-2 h-4 w-4" /> Upload New Document
            </Button>
        </div>
      </div>

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
          <CardDescription>View and manage all historical and current documents for this vehicle.</CardDescription>
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
                        const { text: statusText, config: displayConfig } = getEffectiveDocDisplayConfig(doc, vehicle.documents);
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
                              <Button variant="outline" size="sm" className="mr-2 text-xs h-7" onClick={() => handleOpenUploadModal({ type: doc.type, customTypeName: doc.customTypeName })}>
                                 <UploadCloud className="mr-1 h-3 w-3" /> Add New
                              </Button>
                              {doc.documentUrl ? (
                                <Button variant="link" size="sm" asChild className="text-xs p-0 h-7">
                                  <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer">View Doc</a>
                                </Button>
                              ) : (
                                <Button variant="link" size="sm" className="text-xs p-0 h-7 text-muted-foreground" disabled>No File</Button>
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

      {isModalOpen && vehicle && (
        <DocumentUploadModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditingDocumentContext(null); }}
          onSubmit={handleDocumentSubmit}
          vehicleId={vehicle.id}
          initialDocumentData={editingDocumentContext}
          extractExpiryDateFn={extractExpiryDate}
        />
      )}
    </div>
    </TooltipProvider>
  );
}

    
