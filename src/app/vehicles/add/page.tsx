import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { addVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';

export default function AddVehiclePage() {
  
  const handleSubmit = async (data: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>) => {
    "use server"; // Marking this function for server-side execution if it's an action
    try {
      const newVehicle = await addVehicle(data);
      return newVehicle;
    } catch (error) {
      console.error("Failed to add vehicle:", error);
      // Handle error appropriately, maybe re-throw or return an error object
      throw error;
    }
  };

  return (
    <div>
      <VehicleForm onSubmit={handleSubmit} isEditing={false} />
    </div>
  );
}
