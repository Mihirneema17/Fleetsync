
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { addVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { logger } from '@/lib/logger';

export default function AddVehiclePage() {
  
  const handleSubmit = async (data: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>) => {
    "use server"; 
    try {
      logger.info('[SA_START] addVehicle handleSubmit', { registrationNumber: data.registrationNumber });
      const newVehicle = await addVehicle(data);
      logger.info('[SA_SUCCESS] addVehicle handleSubmit', { vehicleId: newVehicle?.id });
      return newVehicle;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while adding the vehicle.";
      logger.error('[SA_ERROR] Failed to add vehicle in handleSubmit Server Action', error, { originalData: data });
      return { error: errorMessage };
    }
  };

  return (
    <div>
      <VehicleForm onSubmit={handleSubmit} isEditing={false} />
    </div>
  );
}
