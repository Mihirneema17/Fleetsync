
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Vehicle, VehicleDocument, DocumentType as VehicleDocumentType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { UploadCloud, FilePlus2 } from 'lucide-react';
import { DocumentUploadModal } from '@/components/document/document-upload-modal';
import { useToast } from '@/hooks/use-toast';
import { addOrUpdateDocument } from '@/lib/data'; // Direct import of server action
import type { ExtractExpiryDateInput, ExtractExpiryDateOutput } from '@/ai/flows/extract-expiry-date';
import { DOCUMENT_TYPES } from '@/lib/constants'; // Import document types

interface VehicleDocumentManagerProps {
  vehicle: Vehicle;
  extractExpiryDateFn: (input: ExtractExpiryDateInput) => Promise<ExtractExpiryDateOutput>;
}

export function VehicleDocumentManager({ vehicle, extractExpiryDateFn }: VehicleDocumentManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDocumentContext, setEditingDocumentContext] = useState<Partial<VehicleDocument> | { type: VehicleDocumentType, customTypeName?: string } | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const handleOpenUploadModal = (docContext?: Partial<VehicleDocument> | { type: VehicleDocumentType, customTypeName?: string }) => {
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
        toast({ title: 'Success', description: `Document for ${data.documentType === 'Other' && data.customTypeName ? data.customTypeName : data.documentType} added successfully.` });
        router.refresh(); 
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

  const predefinedDocTypes = DOCUMENT_TYPES.filter(type => type !== 'Other');

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2 mb-4">
        {predefinedDocTypes.map(docType => (
          <Button 
            key={docType}
            variant="outline"
            size="sm"
            onClick={() => handleOpenUploadModal({ type: docType })}
            className="flex-shrink-0"
          >
            <UploadCloud className="mr-2 h-4 w-4" /> Upload New {docType}
          </Button>
        ))}
        <Button 
            variant="outline"
            size="sm"
            onClick={() => handleOpenUploadModal({ type: 'Other' })}
            className="flex-shrink-0"
        >
            <FilePlus2 className="mr-2 h-4 w-4" /> Upload Other Document
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
