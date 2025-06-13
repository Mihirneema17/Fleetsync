
import { notFound } from 'next/navigation';
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { getVehicleById, updateVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger'; // Ensure logger is imported

export default async function EditVehiclePage({ params }: { params: { id: string } }) {
  const vehicle = await getVehicleById(params.id, null /* Fetching initial data, auth check on update */);

  if (!vehicle) {
    notFound();
  }

  const handleSubmitServerAction = async (
    data: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>,
    currentUserId: string | null // Explicitly typed
  ): Promise<Vehicle | { error: string } | undefined | void> => {
    "use server";
    // CRITICAL DIAGNOSTIC LOG:
    logger.error(`[SERVER_ACTION_EDIT_VEHICLE] Received currentUserId: ${currentUserId === null ? 'null' : (currentUserId === undefined ? 'undefined' : currentUserId)} for vehicle ID: ${params.id}`, { registrationNumber: data.registrationNumber });

    if (!currentUserId) {
      logger.error(`[SA_ERROR] updateVehicle handleSubmitServerAction - Critical: No currentUserId provided to server action. Cannot update vehicle ID: ${params.id}.`);
      return { error: "User not authenticated. Cannot update vehicle." };
    }

    logger.info(`[SA_START] updateVehicle handleSubmitServerAction invoked for user: ${currentUserId}`, { vehicleId: params.id, registrationNumber: data.registrationNumber });

    try {
      logger.info(`[SA_INFO] updateVehicle handleSubmitServerAction - Proceeding to call data.updateVehicle for user: ${currentUserId}`, { vehicleId: params.id, registrationNumber: data.registrationNumber });
      const updated = await updateVehicle(params.id, data, currentUserId); 

      if (updated && typeof updated === 'object' && 'error' in updated && updated.error) {
         logger.error('[SA_ERROR] updateVehicle handleSubmitServerAction - data.updateVehicle returned an error', { error: updated.error, vehicleId: params.id });
         return { error: updated.error };
      }
      if (!updated) { 
         logger.error('[SA_ERROR] updateVehicle handleSubmitServerAction - data.updateVehicle returned undefined, indicating failure.', { vehicleId: params.id });
         return { error: "Failed to update vehicle. Unknown error from data layer." };
      }

      revalidatePath('/vehicles');
      revalidatePath(`/vehicles/${params.id}`);
      logger.info('[SA_SUCCESS] updateVehicle handleSubmitServerAction - Vehicle updated successfully', { vehicleId: params.id, registrationNumber: data.registrationNumber });
      return updated; 
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while updating the vehicle.";
      logger.error(`[SA_CATCH_ERROR] Failed to update vehicle in server action (ID: ${params.id}):`, error, { currentUserId, originalData: data });
      return { error: errorMessage };
    }
  };

  return (
    <div>
      <VehicleForm
        initialData={vehicle}
        onSubmit={handleSubmitServerAction}
        isEditing={true}
      />
    </div>
  );
}
