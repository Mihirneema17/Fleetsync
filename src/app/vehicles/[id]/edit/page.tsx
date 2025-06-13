
import { notFound } from 'next/navigation';
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { getVehicleById, updateVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger'; // Added logger

export default async function EditVehiclePage({ params }: { params: { id: string } }) {
  // For fetching initial data for the form, user ID might not be strictly necessary
  // if any authenticated user can view any vehicle to edit (permissions handled on update).
  // However, if fetching vehicle data itself should be user-specific, currentUserId would be needed here too.
  // For now, we assume data.getVehicleById can handle a null userId for fetching or has other means.
  const vehicle = await getVehicleById(params.id, null /* Adjust if needed for read access control */);

  if (!vehicle) {
    notFound();
  }

  const handleSubmitServerAction = async (
    data: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>,
    currentUserId: string | null // Accept currentUserId
  ) => {
    "use server";
    logger.info('[SA_START] updateVehicle handleSubmitServerAction invoked', { vehicleId: params.id, registrationNumber: data.registrationNumber, currentUserIdExists: !!currentUserId });

    if (!currentUserId) {
      logger.error('[SA_ERROR] updateVehicle handleSubmitServerAction - No currentUserId provided. Cannot update vehicle.');
      return { error: "User not authenticated. Cannot update vehicle." };
    }

    try {
      logger.info(`[SA_INFO] updateVehicle handleSubmitServerAction - Proceeding to call data.updateVehicle for user: ${currentUserId}`, { vehicleId: params.id, registrationNumber: data.registrationNumber });
      const updated = await updateVehicle(params.id, data, currentUserId); // Pass currentUserId

      if (updated && typeof updated === 'object' && 'error' in updated && updated.error) {
         logger.error('[SA_ERROR] updateVehicle handleSubmitServerAction - data.updateVehicle returned an error', { error: updated.error, vehicleId: params.id });
         return { error: updated.error };
      }
      if (!updated) { // Handle case where updateVehicle might return undefined on failure without specific error
         logger.error('[SA_ERROR] updateVehicle handleSubmitServerAction - data.updateVehicle returned undefined, indicating failure.', { vehicleId: params.id });
         return { error: "Failed to update vehicle. Unknown error from data layer." };
      }

      revalidatePath('/vehicles');
      revalidatePath(`/vehicles/${params.id}`);
      logger.info('[SA_SUCCESS] updateVehicle handleSubmitServerAction - Vehicle updated successfully', { vehicleId: params.id, registrationNumber: data.registrationNumber });
      return updated; // Return the updated vehicle object (or void if your form doesn't expect it)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while updating the vehicle.";
      logger.error("Failed to update vehicle in server action:", error, { vehicleId: params.id, currentUserId, originalData: data });
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
