
import { notFound } from 'next/navigation';
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { getVehicleById, updateVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger'; // Added logger

export default async function EditVehiclePage({ params }: { params: { id: string } }) {
  // In a server component, getting client-side Firebase Auth user is non-trivial.
  // For now, we assume getVehicleById might operate without strict user check or handle null userId.
  // The primary fix is for the update action.
  const vehicle = await getVehicleById(params.id, null /* TODO: Secure this with actual user ID if page is user-specific */);

  if (!vehicle) {
    notFound();
  }

  const handleSubmitServerAction = async (
    data: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>,
    currentUserId: string | null // Accept currentUserId
  ) => {
    "use server";
    if (!currentUserId) {
      logger.error('[SA_ERROR] updateVehicle handleSubmitServerAction - No currentUserId provided.');
      return { error: "User not authenticated. Cannot update vehicle." };
    }
    try {
      const updated = await updateVehicle(params.id, data, currentUserId); // Pass currentUserId
      revalidatePath('/vehicles');
      revalidatePath(`/vehicles/${params.id}`); 
      return updated;
    } catch (error) {
      logger.error("Failed to update vehicle in server action:", error, { vehicleId: params.id, currentUserId });
      return { error: (error as Error).message || "Failed to update vehicle." };
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
