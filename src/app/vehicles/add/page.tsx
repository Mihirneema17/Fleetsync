
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
    if (!currentUserId) {
      logger.error('[SA_ERROR] addVehicle handleSubmitWithUser - No currentUserId provided.');
      return { error: "User not authenticated. Cannot add vehicle." };
    }
    try {
      logger.info('[SA_START] addVehicle handleSubmitWithUser', { registrationNumber: data.registrationNumber, currentUserId });
      const newVehicle = await addVehicle(data, currentUserId); // Pass currentUserId to data.addVehicle
      logger.info('[SA_SUCCESS] addVehicle handleSubmitWithUser', { vehicleId: newVehicle?.id });
      return newVehicle;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while adding the vehicle.";
      logger.error('[SA_ERROR] Failed to add vehicle in handleSubmitWithUser Server Action', error, { originalData: data, currentUserId });
      return { error: errorMessage };
    }
  };

  return (
    <div>
      <VehicleForm onSubmit={handleSubmitWithUser} isEditing={false} />
    </div>
  );
}
