
import { notFound } from 'next/navigation';
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { getVehicleById, updateVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { revalidatePath } from 'next/cache';

// This page is a Server Component that prepares data for VehicleForm (Client Component)
export default async function EditVehiclePage({ params }: { params: { id: string } }) {
  const vehicle = await getVehicleById(params.id);

  if (!vehicle) {
    notFound();
  }

  // This server action will be passed to the client component (VehicleForm)
  const handleSubmitServerAction = async (data: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>) => {
    "use server";
    try {
      const updated = await updateVehicle(params.id, data);
      // Revalidate the path to ensure the list page (Server Component) refetches data
      revalidatePath('/vehicles');
      revalidatePath(`/vehicles/${params.id}`); // Also revalidate the detail page
      return updated;
    } catch (error) {
      console.error("Failed to update vehicle:", error);
      // It's often better to return an error object or throw for client-side handling
      return { error: (error as Error).message || "Failed to update vehicle." };
    }
  };

  return (
    <div>
      {/* 
        VehicleForm is a client component.
        We pass the server action handleSubmitServerAction to it.
        VehicleForm itself will handle calling this action, displaying toasts, and redirecting.
      */}
      <VehicleForm
        initialData={vehicle}
        onSubmit={handleSubmitServerAction}
        isEditing={true}
      />
    </div>
  );
}
