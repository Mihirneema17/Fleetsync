
"use client";

import React, { useState, useMemo } from 'react'; // Added useMemo
import { useRouter } from 'next/navigation';
import type { Vehicle, VehicleDocument, DocumentType as VehicleDocumentType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { UploadCloud, FilePlus2 } from 'lucide-react';
import { DocumentUploadModal } from '@/components/document/document-upload-modal';
import { addOrUpdateDocument } from '@/lib/data'; // Direct import of server action
import { DOCUMENT_TYPES } from '@/lib/constants'; // Import document types
import { getLatestDocumentForType } from '@/lib/utils'; // Import utility

interface VehicleDocumentManagerProps {
  vehicle: Vehicle;
  extractExpiryDateFn: (input: ExtractExpiryDateInput) => Promise<ExtractExpiryDateOutput>;
  smartIngestDocumentFn: (input: SmartIngestInput) => Promise<SmartIngestOutput>; // Import smartIngestDocumentFn
  currentUserId: string | null; // Added currentUserId
}

export function VehicleDocumentManager({ vehicle, extractExpiryDateFn, smartIngestDocumentFn, currentUserId }: VehicleDocumentManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDocumentContext, setEditingDocumentContext] = useState<Partial<VehicleDocument> | { type: VehicleDocumentType, customTypeName?: string, policyNumber?: string | null } | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const handleOpenUploadModal = (docContextInput?: { type: VehicleDocumentType, customTypeName?: string }) => {
    let contextForModal: { type: VehicleDocumentType, customTypeName?: string, policyNumber?: string | null } = {
        type: docContextInput?.type || 'Insurance', // Default to Insurance if no context
        customTypeName: docContextInput?.customTypeName,
        policyNumber: null,
    };

    if (docContextInput?.type) {
        const latestExistingDoc = getLatestDocumentForType(
            vehicle,
            docContextInput.type,
            docContextInput.type === 'Other' ? docContextInput.customTypeName : undefined
        );
        if (latestExistingDoc && latestExistingDoc.policyNumber) {
            contextForModal.policyNumber = latestExistingDoc.policyNumber;
        }
    }
    
    setEditingDocumentContext(contextForModal);
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
 aiExpiryDateConfidence?: number | null,
 // New AI fields from smartIngestDocument for RegistrationCard
 aiExtractedRegistrationNumber?: string | null,
 aiRegistrationNumberConfidence?: number | null,
 aiExtractedMake?: string | null,
 aiMakeConfidence?: number | null,
 aiExtractedModel?: string | null,
 aiModelConfidence?: number | null,
  ) => {
    if (!vehicle) return;

 if (data.documentType === 'RegistrationCard' && data.documentFile) {
 // Use smartIngestDocumentFn for RegistrationCard
 try {
 const reader = new FileReader();
 reader.readAsDataURL(data.documentFile);
 reader.onloadend = async () => {
 const base64data = reader.result as string;
 const aiOutput = await smartIngestDocumentFn({ documentDataUri: base64data });
 // Continue with addOrUpdateDocument using AI output
 // Note: Vehicle details update is handled in addOrUpdateDocument
 // (We need to pass vehicle ID to addOrUpdateDocument to update vehicle fields if needed)
 // This logic might need refinement to trigger vehicle update from here or within the server action
 };
 } catch (error) {
 console.error('Error during smart ingestion:', error);
 toast({ title: 'AI Error', description: 'Failed to process document with AI.', variant: 'destructive' });
 }
 }
     if (!currentUserId) {
      toast({ title: "Authentication Error", description: "Cannot save document without user authentication.", variant: "destructive" });
      return;
    }
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
 aiExtractedStartDate, // These come from extractExpiryDateFn or manual input
 aiStartDateConfidence, // These come from extractExpiryDateFn or manual input
        aiExtractedDate: aiExtractedExpiryDate,
        aiConfidence: aiExpiryDateConfidence,
 // Pass AI extracted data from smartIngestDocumentFn if available (for RegistrationCard)
 aiExtractedRegistrationNumber: aiExtractedRegistrationNumber,
 aiRegistrationNumberConfidence: aiRegistrationNumberConfidence,
 aiExtractedMake: aiExtractedMake,
 aiMakeConfidence: aiMakeConfidence,
 aiExtractedModel: aiExtractedModel,
 aiModelConfidence: aiModelConfidence,
      }, currentUserId); // Pass currentUserId
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

  const predefinedDocTypes = useMemo(() => DOCUMENT_TYPES.filter(type => type !== 'Other'), []);

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
