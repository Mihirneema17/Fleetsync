
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { addVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { logger } from '@/lib/logger';

export default function AddVehiclePage() {
  
  const handleSubmitWithUser = async (
    data: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>,
    currentUserId: string | null // Accept currentUserId
  ) => {
    "use server"; 
    logger.info('[SA_START] addVehicle handleSubmitWithUser invoked', { registrationNumber: data.registrationNumber, currentUserIdExists: !!currentUserId });

    if (!currentUserId) {
      logger.error('[SA_ERROR] addVehicle handleSubmitWithUser - No currentUserId provided. Cannot add vehicle.');
      // Return an object with an error key, which VehicleForm can check
      return { error: "User not authenticated. Cannot add vehicle." };
    }
    
    try {
      logger.info(`[SA_INFO] addVehicle handleSubmitWithUser - Proceeding to call data.addVehicle for user: ${currentUserId}`, { registrationNumber: data.registrationNumber });
      const newVehicle = await addVehicle(data, currentUserId); // Pass currentUserId to data.addVehicle
      
      if (newVehicle && 'error' in newVehicle && newVehicle.error) {
         logger.error('[SA_ERROR] addVehicle handleSubmitWithUser - data.addVehicle returned an error', { error: newVehicle.error, registrationNumber: data.registrationNumber });
         return { error: newVehicle.error };
      }
      
      logger.info('[SA_SUCCESS] addVehicle handleSubmitWithUser - Vehicle added successfully', { vehicleId: newVehicle?.id, registrationNumber: data.registrationNumber });
      return newVehicle;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while adding the vehicle.";
      logger.error('[SA_ERROR] Failed to add vehicle in handleSubmitWithUser Server Action', { originalData: data, currentUserId, errorDetails: error });
      return { error: errorMessage };
    }
  };

  return (
    <div>
      <VehicleForm onSubmit={handleSubmitWithUser} isEditing={false} />
    </div>
  );
}
