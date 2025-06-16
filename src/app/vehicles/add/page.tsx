
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { addVehicle } from '@/lib/data';
import type { Vehicle, VehicleDocument } from '@/lib/types';
import { logger } from '@/lib/logger'; 
import { smartIngestDocument, type SmartIngestOutput } from '@/ai/flows/smart-ingest-flow';
// useRouter import removed as it's a client hook and not used in this Server Component.
// Redirection is handled by the client-side VehicleForm.
import { revalidatePath } from 'next/cache'; // Use for revalidating paths

export default function AddVehiclePage() {
  
  const handleSubmitWithUser = async (
    // Updated to accept the new structure from VehicleForm
 data: { registrationNumber: string; type: string; make: string; model: string; registrationDocumentFile?: FileList | null },
 currentUserId: string | null
  ): Promise<{ vehicle?: Vehicle; error?: string; redirectTo?: string } | void> => {
    "use server"; 
    logger.error(`[SERVER_ACTION_ADD_VEHICLE] Received currentUserId: ${currentUserId === null ? 'null' : (currentUserId === undefined ? 'undefined' : currentUserId)}`, { registrationNumber: data.registrationNumber });

    if (!currentUserId) {
      const errorMsg = "User not authenticated. Cannot add vehicle.";
      logger.error('[SA_ERROR] addVehicle handleSubmitWithUser - Critical: No currentUserId provided to server action.', { registrationNumber: data.registrationNumber });
      return { error: errorMsg };
    }

    logger.info(`[SA_START] addVehicle handleSubmitWithUser invoked for user: ${currentUserId}`, { registrationNumber: data.registrationNumber });

    let suggestions: SmartIngestOutput | undefined;

    try {
      // Prepare document data if a file was uploaded
      let registrationDocumentData: Pick<VehicleDocument, 'type' | 'documentName' | 'documentUrl'> | undefined;
      if (data.registrationDocumentFile && data.registrationDocumentFile.length > 0) {
        const file = data.registrationDocumentFile[0];

        // Convert File to Data URI (assuming a helper function exists or implement inline)
        // NOTE: In a production app, you'd likely upload to cloud storage and pass the URL,
        // or pass the file directly to a Genkit server endpoint configured for file handling.
        // Converting large files to data URIs on the server might consume significant memory.
        // For now, we'll simulate this with a placeholder or a simple conversion if feasible.
        // Let's assume we have a `fileToDataUri` helper for demonstration.
        const fileToDataUri = async (file: File): Promise<string> => {
           // Basic mock implementation - replace with actual file reading in production if needed server-side
           // For large files, server-side file reading into memory might be an issue.
           // A better approach might be using client-side JS to get the dataURI and send it.
           return `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;
        };

        // In a real application, you would upload the file to storage here
        // For now, we use a mock URL and the actual file name
        registrationDocumentData = {
          type: 'RegistrationCard',
          documentName: file.name,
          documentUrl: `/mock-docs/${encodeURIComponent(file.name)}`, // Using a mock URL
        };
        logger.info(`[SA_INFO] Processing RegistrationCard file: ${file.name}`, { registrationNumber: data.registrationNumber });

        try {
            const dataUri = await fileToDataUri(file);
            logger.info(`[SA_INFO] Calling smartIngestDocument AI for ${file.name}`);
            suggestions = await smartIngestDocument({ documentDataUri: dataUri });
            logger.info(`[SA_INFO] AI SmartIngest response received:`, suggestions);
            // Important: We return suggestions *before* adding the vehicle.
            // The client form will use these suggestions, potentially allowing the user to confirm/edit,
            // and then submit the form again with the corrected/confirmed data *without* the file.
            return { suggestions };
        } catch (aiError) {
            logger.error('[SA_AI_ERROR] Failed to call smartIngestDocument AI.', { errorDetails: String(aiError) });
            // Continue with adding the vehicle without AI data if AI fails,
            // but inform the user on the client side.
            // For now, we'll just log and let the process continue without suggestions.
            // A better approach might be to return an error specific to AI processing.
        }
      }

      const vehicleDataToAdd = {
        registrationNumber: data.registrationNumber,
        type: data.type, make: data.make, model: data.model,
      };
      const newVehicle = await addVehicle(vehicleDataToAdd, currentUserId, registrationDocumentData);
      return { vehicle: newVehicle, redirectTo: `/vehicles?new=${newVehicle.id}` };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while adding the vehicle.";
      logger.error('[SA_CATCH_ERROR] Failed to add vehicle in handleSubmitWithUser Server Action', { originalData: data, currentUserId, errorDetails: String(error) });
      return { error: errorMessage };
    }
    // Note: revalidatePath was moved inside the try block after addVehicle succeeds
 revalidatePath('/vehicles');
 revalidatePath('/'); // Revalidate dashboard too
  };

  return (
    <div>
      <VehicleForm onSubmit={handleSubmitWithUser} isEditing={false} />
    </div>
  );
}
