import { notFound } from 'next/navigation';
import { VehicleForm } from '@/components/vehicle/vehicle-form';
import { getVehicleById, updateVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';

export default async function EditVehiclePage({ params }: { params: { id: string } }) {
  const vehicle = await getVehicleById(params.id);

  if (!vehicle) {
    notFound();
  }

  const handleSubmit = async (data: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>) => {
    "use server";
    try {
      const updated = await updateVehicle(params.id, data);
      return updated;
    } catch (error) {
      console.error("Failed to update vehicle:", error);
      throw error;
    }
  };

  return (
    <div>
      <VehicleForm initialData={vehicle} onSubmit={handleSubmit} isEditing={true} />
    </div>
  );
}
