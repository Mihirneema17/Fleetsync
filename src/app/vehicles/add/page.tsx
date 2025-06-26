
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { addVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { logger } from '@/lib/logger'; 
import { smartIngestDocument, type SmartIngestOutput } from '@/ai/flows/smart-ingest-flow';
import { revalidatePath } from 'next/cache'; // Use for revalidating paths

export default function AddVehiclePage() {
  
  const handleSubmitWithUser = async (
    data: { registrationNumber: string; type: string; make: string; model: string },
    aiData: SmartIngestOutput | null,
    fileDetails: { name: string, type: string } | null,
    dataUri: string | null,
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

    try {
      // Prepare registration document data if a file was provided
      let registrationDocument: { name: string; url: string } | null = null;
      if (fileDetails && dataUri) {
        registrationDocument = {
          name: fileDetails.name,
          url: dataUri,
        };
        logger.info(`[SA_INFO] Preparing RegistrationCard data for addVehicle: ${fileDetails.name}`, { registrationNumber: data.registrationNumber, aiData: aiData ? 'present' : 'absent' });
      }

      const vehicleDataToAdd = {
        ...data,
        registrationDocument: registrationDocument,
        aiExtraction: aiData,
      };

      const newVehicle = await addVehicle(
        vehicleDataToAdd,
        currentUserId
      );

      revalidatePath('/vehicles');
      revalidatePath('/'); // Revalidate dashboard too

      return { vehicle: newVehicle, redirectTo: `/vehicles?new=${newVehicle.id}` };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while adding the vehicle.";
      logger.error('[SA_CATCH_ERROR] Failed to add vehicle in handleSubmitWithUser Server Action', { originalData: data, currentUserId, errorDetails: String(error) });
      return { error: errorMessage };
    }
  };

  return (
    <div>
      <VehicleForm onSubmit={handleSubmitWithUser} isEditing={false} />
    </div>
  );
}
