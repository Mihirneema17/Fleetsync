
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getVehicles } from '@/lib/data';
import { VehicleListClient } from '@/components/vehicle/vehicle-list-client';

// This page is now a Server Component
export default async function VehiclesPage() {
  const vehicles = await getVehicles(); // Fetch data directly in the Server Component

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-headline">Manage Vehicles</h1>
        <Link href="/vehicles/add">
          <Button>
            <PlusCircle className="mr-2 h-5 w-5" />
            Add New Vehicle
          </Button>
        </Link>
      </div>
      {/* Pass fetched vehicles to the client component for rendering */}
      <VehicleListClient initialVehicles={vehicles} />
    </div>
  );
}
