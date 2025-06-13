
"use server";

import { deleteVehicle as deleteVehicleAction, getVehicles, addOrUpdateDocument } from '@/lib/data';
import { revalidatePath } from 'next/cache';
import type { SmartIngestFormValues } from '@/components/document/smart-document-ingestion-modal';
import type { SmartIngestOutput } from '@/ai/flows/smart-ingest-flow';
import { format } from 'date-fns';


export async function handleDeleteVehicleServerAction(vehicleId: string) {
  try {
    await deleteVehicleAction(vehicleId);
    revalidatePath('/vehicles'); // Revalidate after deletion
    revalidatePath('/'); // Revalidate dashboard for summary stats
    return { success: true };
  } catch (error) {
    console.error("Failed to delete vehicle:", error);
    return { success: false, error: "Failed to delete vehicle." };
  }
}

export async function processSmartDocumentAndSave(
  vehicleRegistrationNumber: string,
  formData: SmartIngestFormValues,
  fileDetails: { name: string; mockUrl: string }, // Updated to expect mockUrl
  aiResults: SmartIngestOutput | null
): Promise<{ success: boolean; error?: string; vehicleId?: string }> {
  try {
    const allVehicles = await getVehicles(); // This will ensure data is initialized
    const targetVehicle = allVehicles.find(
      (v) => v.registrationNumber.toLowerCase() === vehicleRegistrationNumber.toLowerCase()
    );

    if (!targetVehicle) {
      return {
        success: false,
        error: `Vehicle with registration number '${vehicleRegistrationNumber}' not found. Please add the vehicle first or correct the registration number.`,
      };
    }

    if (!formData.expiryDate) {
        return {
            success: false,
            error: "Expiry date is missing in the form data. This should not happen if form validation is correct.",
        };
    }

    const docDataForSave = {
      type: formData.documentType,
      customTypeName: formData.documentType === 'Other' ? formData.customTypeName : undefined,
      policyNumber: formData.policyNumber,
      startDate: formData.startDate ? format(formData.startDate, 'yyyy-MM-dd') : null,
      expiryDate: format(formData.expiryDate, 'yyyy-MM-dd'), // Already validated to be non-null
      documentName: fileDetails.name,
      documentUrl: fileDetails.mockUrl, // Use mockUrl
      // storagePath: null, // No longer storing storagePath
      // Pass through all AI extracted details from the original AI call
      aiExtractedPolicyNumber: aiResults?.policyNumber,
      aiPolicyNumberConfidence: aiResults?.policyNumberConfidence,
      aiExtractedStartDate: aiResults?.startDate,
      aiStartDateConfidence: aiResults?.startDateConfidence,
      aiExtractedDate: aiResults?.expiryDate, // This is for expiryDate
      aiConfidence: aiResults?.expiryDateConfidence, // This is for expiryDateConfidence
    };

    const updatedVehicle = await addOrUpdateDocument(targetVehicle.id, docDataForSave);

    if (updatedVehicle) {
      revalidatePath('/'); // For dashboard summary stats
      revalidatePath('/vehicles'); // For vehicle list page
      revalidatePath(`/vehicles/${targetVehicle.id}`); // For vehicle detail page
      revalidatePath('/alerts'); // For alerts page
      revalidatePath('/reports/expiring-documents'); // For reports page
      return { success: true, vehicleId: targetVehicle.id };
    } else {
      return { success: false, error: "Failed to save the document to the vehicle." };
    }
  } catch (error) {
    console.error("Error in processSmartDocumentAndSave:", error);
    return { success: false, error: error instanceof Error ? error.message : "An unexpected error occurred during document processing." };
  }
}
