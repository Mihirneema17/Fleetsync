
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { addVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { logger } from '@/lib/logger'; 
// useRouter import removed as it's a client hook and not used in this Server Component.
// Redirection is handled by the client-side VehicleForm.
import { revalidatePath } from 'next/cache'; // Use for revalidating paths

export default function AddVehiclePage() {
  
  const handleSubmitWithUser = async (
    data: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>,
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
      logger.info(`[SA_INFO] addVehicle handleSubmitWithUser - Proceeding to call data.addVehicle for user: ${currentUserId}`, { registrationNumber: data.registrationNumber });
      const newVehicle = await addVehicle(data, currentUserId); 
      
      logger.info('[SA_SUCCESS] addVehicle handleSubmitWithUser - Vehicle added successfully', { vehicleId: newVehicle.id, registrationNumber: data.registrationNumber });
      
      revalidatePath('/vehicles');
      revalidatePath('/'); // Revalidate dashboard too

      // Instead of router.push directly, return a redirectTo field for the client to handle
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
