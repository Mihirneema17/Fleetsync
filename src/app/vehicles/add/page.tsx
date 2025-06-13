
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { addVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { logger } from '@/lib/logger'; // Ensure logger is imported

export default function AddVehiclePage() {
  
  const handleSubmitWithUser = async (
    data: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>,
    currentUserId: string | null // Explicitly typed
  ): Promise<Vehicle | { error: string } | undefined | void> => {
    "use server"; 
    // CRITICAL DIAGNOSTIC LOG:
    logger.error(`[SERVER_ACTION_ADD_VEHICLE] Received currentUserId: ${currentUserId === null ? 'null' : (currentUserId === undefined ? 'undefined' : currentUserId)}`, { registrationNumber: data.registrationNumber });

    if (!currentUserId) {
      logger.error('[SA_ERROR] addVehicle handleSubmitWithUser - Critical: No currentUserId provided to server action. Cannot add vehicle.', { registrationNumber: data.registrationNumber });
      return { error: "User not authenticated. Cannot add vehicle." };
    }
    
    logger.info(`[SA_START] addVehicle handleSubmitWithUser invoked for user: ${currentUserId}`, { registrationNumber: data.registrationNumber });
    
    try {
      logger.info(`[SA_INFO] addVehicle handleSubmitWithUser - Proceeding to call data.addVehicle for user: ${currentUserId}`, { registrationNumber: data.registrationNumber });
      const newVehicle = await addVehicle(data, currentUserId); // Pass currentUserId to data.addVehicle
      
      // The addVehicle function now throws an error if currentUserId is missing,
      // so we rely on the catch block for that. It returns Vehicle on success.
      // If it could return an error object, we'd check for it like:
      // if (newVehicle && typeof newVehicle === 'object' && 'error' in newVehicle && newVehicle.error) {
      //    logger.error('[SA_ERROR] addVehicle handleSubmitWithUser - data.addVehicle returned an error', { error: newVehicle.error, registrationNumber: data.registrationNumber });
      //    return { error: newVehicle.error }; 
      // }
      
      logger.info('[SA_SUCCESS] addVehicle handleSubmitWithUser - Vehicle added successfully', { vehicleId: newVehicle.id, registrationNumber: data.registrationNumber });
      return newVehicle; // Return the new vehicle object
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while adding the vehicle.";
      logger.error('[SA_CATCH_ERROR] Failed to add vehicle in handleSubmitWithUser Server Action', { originalData: data, currentUserId, errorDetails: String(error) });
      // Ensure a serializable error object is returned
      return { error: errorMessage };
    }
  };

  return (
    <div>
      <VehicleForm onSubmit={handleSubmitWithUser} isEditing={false} />
    </div>
  );
}
