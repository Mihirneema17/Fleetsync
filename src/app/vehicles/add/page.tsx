
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { addVehicle } from '@/lib/data'; // Assuming addVehicle is correctly typed to accept VehicleFormValues and optional registrationDocument/aiExtraction
import type { Vehicle, VehicleDocument } from '@/lib/types';
import { logger } from '@/lib/logger'; 
import { smartIngestDocument, type SmartIngestOutput } from '@/ai/flows/smart-ingest-flow';
// useRouter import removed as it's a client hook and not used in this Server Component.
// Redirection is handled by the client-side VehicleForm.
import { revalidatePath } from 'next/cache'; // Use for revalidating paths

export default function AddVehiclePage() {
  
  // Updated to accept the new structure from VehicleForm
  const handleSubmitWithUser = async (
 data: { registrationNumber: string; type: string; make: string; model: string }, // Corrected type based on VehicleFormValues
    aiData: SmartIngestOutput | null,
    fileDetails: { name: string, type: string } | null, // New param
 dataUri: string | null, // New param
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

    // Prepare registration document data if a file was provided
    let registrationDocument: { name: string; url: string } | null = null;
    if (fileDetails && dataUri) { // Check if both fileDetails and dataUri are present (now passed as separate params)
      registrationDocument = {
        name: fileDetails.name,
        url: dataUri, // Using dataUri as mock URL for now
      };
      logger.info(`[SA_INFO] Preparing RegistrationCard data for addVehicle: ${fileDetails.name}`, { registrationNumber: data.registrationNumber, aiData: aiData ? 'present' : 'absent' });
    }

      const newVehicle = await addVehicle(
        {
          ...vehicleDataToAdd,
          registrationDocument: registrationDocument,
          aiExtraction: aiData, // Pass AI data to addVehicle
        },
        currentUserId
      );
      return { vehicle: newVehicle, redirectTo: `/vehicles?new=${newVehicle.id}` };

    } catch (error) {
  };

    try {
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
