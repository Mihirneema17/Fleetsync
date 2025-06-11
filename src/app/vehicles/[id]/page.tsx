
"use client";
import { notFound, useRouter } from 'next/navigation';
import { getVehicleById, getDocumentComplianceStatus, addOrUpdateDocument } from '@/lib/data';
import type { Vehicle, VehicleDocument, DocumentType as VehicleDocumentType } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Car, CalendarDays, FileText, UploadCloud, Edit, Trash2, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { DATE_FORMAT, AI_SUPPORTED_DOCUMENT_TYPES } from '@/lib/constants';
import React, { useState, useEffect } from 'react';
import { DocumentUploadModal } from '@/components/document/document-upload-modal';
import { useToast } from '@/hooks/use-toast';
import { extractExpiryDate } from '@/ai/flows/extract-expiry-date';

export default function VehicleDetailPage({ params }: { params: { id: string } }) {
  const { id: vehicleId } = params; // Destructure id here
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Partial<VehicleDocument> | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    async function fetchVehicle() {
      setIsLoading(true);
      const fetchedVehicle = await getVehicleById(vehicleId); // Use destructured id
      if (!fetchedVehicle) {
        notFound();
      } else {
        setVehicle(fetchedVehicle);
      }
      setIsLoading(false);
    }
    fetchVehicle();
  }, [vehicleId]); // Use destructured id in dependency array

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

  const handleOpenUploadModal = (doc?: VehicleDocument) => {
    setEditingDocument(doc || { type: 'Insurance' }); // Default or existing
    setIsModalOpen(true);
  };

  const handleDocumentSubmit = async (
    data: {
      documentType: VehicleDocumentType;
      customTypeName?: string;
      expiryDate: string | null;
      documentFile?: File;
    },
    aiExtractedDate?: string | null,
    aiConfidence?: number | null
  ) => {
    if (!vehicle) return;
    try {
      const updatedVehicle = await addOrUpdateDocument(vehicle.id, {
        type: data.documentType,
        customTypeName: data.customTypeName,
        expiryDate: data.expiryDate,
        documentName: data.documentFile?.name,
        aiExtractedDate,
        aiConfidence,
      });
      if (updatedVehicle) {
        setVehicle(updatedVehicle);
        toast({ title: 'Success', description: `Document ${editingDocument?.id ? 'updated' : 'added'} successfully.` });
      } else {
        throw new Error('Failed to update vehicle from server');
      }
      setIsModalOpen(false);
      setEditingDocument(null);
      router.refresh(); // To ensure data consistency if alerts/summaries are affected
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


  return (
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
                <UploadCloud className="mr-2 h-4 w-4" /> Upload Document
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
          <CardTitle className="font-headline">Compliance Documents</CardTitle>
          <CardDescription>Manage and track expiry dates for all essential documents.</CardDescription>
        </CardHeader>
        <CardContent>
          {vehicle.documents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document Type</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicle.documents.map((doc) => {
                  const status = getDocumentComplianceStatus(doc.expiryDate); // Re-evaluate status client-side too
                  const config = getStatusConfig(status);
                  const StatusIcon = config.icon;
                  return (
                    <TableRow key={doc.id} className={cn(config.bgColor?.replace('bg-','hover:bg-opacity-80 hover:'), doc.status === "Missing" ? "opacity-60" : "")}>
                      <TableCell className="font-medium">
                        <FileText className="inline mr-2 h-4 w-4 text-muted-foreground" />
                        {doc.type === 'Other' && doc.customTypeName ? doc.customTypeName : doc.type}
                      </TableCell>
                      <TableCell>
                        {doc.expiryDate ? format(parseISO(doc.expiryDate), DATE_FORMAT) : (
                          <span className="text-muted-foreground italic">Not Set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.badgeVariant} className={cn(
                           status === 'ExpiringSoon' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : '',
                           status === 'Compliant' ? 'bg-green-100 text-green-800 border-green-300' : ''
                        )}>
                          <StatusIcon className={cn("mr-1 h-3 w-3", config.color)} />
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="mr-2" onClick={() => handleOpenUploadModal(doc)}>
                           <UploadCloud className="mr-1 h-4 w-4" /> {doc.expiryDate ? 'Update' : 'Upload'}
                        </Button>
                        {doc.documentUrl && (
                          <Button variant="link" size="sm" asChild>
                            <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer">View</a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-4" />
              <p>No documents uploaded for this vehicle yet.</p>
            </div>
          )}
        </CardContent>
        {/* <CardFooter>
            <Button variant="outline" onClick={() => handleOpenUploadModal({ type: 'Other' })}>
                <FileText className="mr-2 h-4 w-4" /> Add Custom Document Type
            </Button>
        </CardFooter> */}
      </Card>

      {isModalOpen && vehicle && (
        <DocumentUploadModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditingDocument(null); }}
          onSubmit={handleDocumentSubmit}
          vehicleId={vehicle.id}
          initialDocumentData={editingDocument}
          extractExpiryDateFn={extractExpiryDate}
        />
      )}
    </div>
  );
}
