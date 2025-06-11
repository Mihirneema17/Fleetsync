

"use client";
import { notFound, useRouter } from 'next/navigation';
import { getVehicleById, getDocumentComplianceStatus, addOrUpdateDocument } from '@/lib/data';
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

  const getStatusConfig = (status: VehicleDocument['status']) => {
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

  const handleOpenUploadModal = (docContext?: Partial<VehicleDocument> | { type: VehicleDocumentType }) => {
    setEditingDocumentContext(docContext || { type: 'Insurance' }); 
    setIsModalOpen(true);
  };

  const handleDocumentSubmit = async (
    data: {
      documentType: VehicleDocumentType;
      customTypeName?: string;
      policyNumber?: string | null;
      startDate?: string | null;
      expiryDate: string | null;
      documentFile?: File;
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
        documentName: data.documentFile?.name,
        aiExtractedPolicyNumber,
        aiPolicyNumberConfidence,
        aiExtractedStartDate,
        aiStartDateConfidence,
        aiExtractedDate: aiExtractedExpiryDate, // Corresponds to 'expiryDate'
        aiConfidence: aiExpiryDateConfidence,   // Corresponds to 'expiryDate'
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
                        <TableHead className="w-[18%]">Policy/Doc #</TableHead>
                        <TableHead className="w-[20%]">Validity Period</TableHead>
                        <TableHead className="w-[15%]">Status</TableHead>
                        <TableHead className="w-[12%]">Uploaded</TableHead>
                        <TableHead className="w-[20%]">AI Extracted Info</TableHead>
                        <TableHead className="text-right w-[15%]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {docs.map((doc) => {
                        const status = getDocumentComplianceStatus(doc.expiryDate); 
                        const config = getStatusConfig(status);
                        const StatusIcon = config.icon;
                        const hasAiInfo = doc.aiExtractedPolicyNumber || doc.aiExtractedStartDate || doc.aiExtractedDate;
                        return (
                          <TableRow key={doc.id} className={cn(config.bgColor?.replace('bg-','hover:bg-opacity-80 hover:'), doc.status === "Missing" && !doc.expiryDate ? "opacity-50" : "")}>
                            <TableCell className="text-xs font-medium">
                                {doc.policyNumber || <span className="text-muted-foreground italic">N/A</span>}
                            </TableCell>
                            <TableCell className="text-xs">
                              {doc.startDate ? format(parseISO(doc.startDate), DATE_FORMAT) : <span className="text-muted-foreground italic">N/A</span>}
                              {' - '}
                              {doc.expiryDate ? format(parseISO(doc.expiryDate), DATE_FORMAT) : <span className="text-muted-foreground italic">N/A</span>}
                            </TableCell>
                            <TableCell>
                              <Badge variant={config.badgeVariant} className={cn(
                                "text-xs",
                                status === 'ExpiringSoon' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : '',
                                status === 'Compliant' ? 'bg-green-100 text-green-800 border-green-300' : ''
                              )}>
                                <StatusIcon className={cn("mr-1 h-3 w-3", config.color)} />
                                {status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                                {format(parseISO(doc.uploadedAt), `${DATE_FORMAT}`)}
                                {doc.documentName && <p className="text-muted-foreground truncate max-w-[100px] text-[10px]">{doc.documentName}</p>}
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
                              {doc.documentUrl && (
                                <Button variant="link" size="sm" asChild className="text-xs p-0 h-7">
                                  <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer">View Doc</a>
                                </Button>
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

