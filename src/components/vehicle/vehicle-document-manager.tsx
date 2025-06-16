
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Vehicle, VehicleDocument, DocumentType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { UploadCloud, FilePlus2 } from 'lucide-react';
import { DocumentUploadModal } from '@/components/document/document-upload-modal';
import { addOrUpdateDocument } from '@/lib/data';
import type { SmartIngestInput, SmartIngestOutput } from '@/ai/flows/smart-ingest-flow';
import { useToast } from "@/hooks/use-toast";
import { useMemo } from 'react';

interface VehicleDocumentManagerProps {
  vehicle: Vehicle;
  extractExpiryDateFn: (input: ExtractExpiryDateInput) => Promise<ExtractExpiryDateOutput>;
  currentUserId: string | null;
}

export function VehicleDocumentManager({ vehicle, extractExpiryDateFn, smartIngestDocumentFn, currentUserId }: VehicleDocumentManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDocumentContext, setEditingDocumentContext] = useState<Partial<VehicleDocument> & { type: DocumentType, customTypeName?: string | null } | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const predefinedDocTypes = useMemo(() => DOCUMENT_TYPES.filter(type => type !== 'Other'), []);

  const handleDocumentSubmit = async (
    data: {
      documentType: DocumentType;
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
  ) => {
    if (!vehicle) return;

    if (!currentUserId) {
      toast({ title: "Authentication Error", description: "Cannot save document without user authentication.", variant: "destructive" });
      return;
    }

    let aiData: {
      policyNumber?: string | null;
      startDate?: string | null;
      expiryDate?: string | null;
      expiryDateConfidence?: number | null;
    } = {};
          const base64data = reader.result as string;
          try {
            if (data.documentType === 'RegistrationCard') {
              const aiOutput = await smartIngestDocumentFn({ documentDataUri: base64data });
              extractedData = {
                registrationNumber: aiOutput.extractedRegistrationNumber,
                registrationNumberConfidence: aiOutput.registrationNumberConfidence,
                make: aiOutput.extractedMake,
                makeConfidence: aiOutput.makeConfidence,
                model: aiOutput.extractedModel,
                modelConfidence: aiOutput.modelConfidence,
                // smartIngest also extracts expiry date and policy number, include them
                policyNumber: aiOutput.extractedPolicyNumber,
                policyNumberConfidence: aiOutput.policyNumberConfidence,
                expiryDate: aiOutput.extractedExpiryDate,
                expiryDateConfidence: aiOutput.expiryDateConfidence,
              };
            } else {
              const aiOutput = await extractExpiryDateFn({ documentDataUri: base64data });
              extractedData = {
                policyNumber: aiOutput.policyNumber,
                policyNumberConfidence: aiOutput.aiConfidence,
                startDate: aiOutput.startDate,
                startDateConfidence: aiOutput.aiConfidence,
                expiryDate: aiOutput.expiryDate, // Note: extractExpiryDate uses 'extractedDate'
                expiryDateConfidence: aiOutput.aiConfidence,
              }; // Assuming extractExpiryDate returns these fields
            }
          } catch (error) {
            console.error('Error during AI extraction:', error);
            toast({ title: 'AI Error', description: 'Failed to process document with AI.', variant: 'destructive' });
          } finally {
            resolve();
          }
        };
      });
    }

    try {
      const updatedVehicle = await addOrUpdateDocument(vehicle.id, {
        type: data.documentType,
        customTypeName: data.customTypeName,
        policyNumber: data.policyNumber,
        startDate: data.startDate,
        expiryDate: data.expiryDate,
        documentName: data.documentName || data.documentFile?.name || `${data.documentType} Document`, // Use file name if no name provided
        documentUrl: data.documentUrl,
        // Use AI extracted data if available, otherwise use manually entered data
        aiExtractedPolicyNumber: extractedData?.policyNumber || aiExtractedPolicyNumber,
        aiPolicyNumberConfidence: extractedData?.policyNumberConfidence || aiPolicyNumberConfidence,
        aiExtractedStartDate: extractedData?.startDate || aiExtractedStartDate,
        aiStartDateConfidence: extractedData?.startDateConfidence || aiStartDateConfidence,
        aiExtractedDate: extractedData?.expiryDate || aiExtractedExpiryDate,
        aiConfidence: extractedData?.expiryDateConfidence || aiExpiryDateConfidence,
      }, currentUserId); // Pass currentUserId

      if (updatedVehicle) {
        toast({ title: 'Success', description: `Document for ${data.documentType === 'Other' && data.customTypeName ? data.customTypeName : data.documentType} added successfully. ${data.documentType === 'RegistrationCard' ? 'Vehicle details updated.' : ''}` });
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

  const handleOpenUploadModal = (docContextInput?: { type: DocumentType, customTypeName?: string }) => {
    // When opening the modal, initialize context with document type and potential custom name
    const contextForModal: Partial<VehicleDocument> & { type: DocumentType, customTypeName?: string | null } = {
      type: docContextInput?.type || 'Insurance', // Default to Insurance if no context
      customTypeName: docContextInput?.customTypeName,
      policyNumber: null, // Initialize with null
    }
    setEditingDocumentContext(contextForModal);
    setIsModalOpen(true);
  };

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
