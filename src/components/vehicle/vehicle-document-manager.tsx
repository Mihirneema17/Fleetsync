
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Vehicle, VehicleDocument, DocumentType as VehicleDocumentType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { UploadCloud } from 'lucide-react';
import { DocumentUploadModal } from '@/components/document/document-upload-modal';
import { useToast } from '@/hooks/use-toast';
import { addOrUpdateDocument } from '@/lib/data'; // Direct import of server action
import type { ExtractExpiryDateInput, ExtractExpiryDateOutput } from '@/ai/flows/extract-expiry-date';

interface VehicleDocumentManagerProps {
  vehicle: Vehicle;
  extractExpiryDateFn: (input: ExtractExpiryDateInput) => Promise<ExtractExpiryDateOutput>;
}

export function VehicleDocumentManager({ vehicle, extractExpiryDateFn }: VehicleDocumentManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDocumentContext, setEditingDocumentContext] = useState<Partial<VehicleDocument> | { type: VehicleDocumentType } | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const handleOpenUploadModal = (docContext?: Partial<VehicleDocument> | { type: VehicleDocumentType }) => {
    setEditingDocumentContext(docContext || { type: 'Insurance' }); // Default to Insurance if no context
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
      // Call the server action directly
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
        toast({ title: 'Success', description: `Document for ${data.documentType} added successfully.` });
        router.refresh(); // Revalidate data for the current page
      } else {
        throw new Error('Failed to update vehicle from server');
      }
      setIsModalOpen(false);
      setEditingDocumentContext(null);
    } catch (error) {
      console.error('Failed to submit document:', error);
      toast({ title: 'Error', description: 'Failed to save document. Please try again.', variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleOpenUploadModal()}>
          <UploadCloud className="mr-2 h-4 w-4" /> Upload New Document
        </Button>
      </div>

      {isModalOpen && vehicle && (
        <DocumentUploadModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditingDocumentContext(null); }}
          onSubmit={handleDocumentSubmit}
          vehicleId={vehicle.id}
          initialDocumentData={editingDocumentContext}
          extractExpiryDateFn={extractExpiryDateFn}
        />
      )}
    </>
  );
}
