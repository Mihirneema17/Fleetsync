
"use server";

import { deleteVehicle as deleteVehicleAction } from '@/lib/data';
import { revalidatePath } from 'next/cache';

export async function handleDeleteVehicleServerAction(vehicleId: string) {
  try {
    await deleteVehicleAction(vehicleId);
    revalidatePath('/vehicles'); // Revalidate after deletion
    return { success: true };
  } catch (error) {
    console.error("Failed to delete vehicle:", error);
    return { success: false, error: "Failed to delete vehicle." };
  }
}
