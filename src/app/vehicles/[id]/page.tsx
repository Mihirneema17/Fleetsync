
import { notFound } from 'next/navigation';
import { getVehicleById } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { format, parseISO } from 'date-fns';
import { DATE_FORMAT } from '@/lib/constants';
import React from 'react';
import VehicleDetailsClient from '@/components/vehicle/vehicle-details-client';

type VehicleDetailPageProps = {
  params: { id: string };
};
export default async function VehicleDetailPage({ params }: VehicleDetailPageProps) {
  const vehicleId = params.id;
  const vehicle = await getVehicleById(vehicleId, null /* TODO: Pass currentUserId if needed for auth */);

  if (!vehicle) {
    notFound();
  }
        <CardHeader>
          <CardTitle className="font-headline">Vehicle Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><span className="font-medium">Registration:</span> {vehicle.registrationNumber}</div>
          <div><span className="font-medium">Type:</span> {vehicle.type}</div>
          <div><span className="font-medium">Make:</span> {vehicle.make}</div>
          <div><span className="font-medium">Model:</span> {vehicle.model}</div>
          <div><span className="font-medium">Added On:</span> {format(parseISO(vehicle.createdAt), DATE_FORMAT)}</div>
          <div><span className="font-medium">Last Updated:</span> {format(parseISO(vehicle.updatedAt), DATE_FORMAT)}</div>
        </CardContent>

      {/* Render the client component that fetches and displays documents */}
      <VehicleDetailsClient vehicleId={vehicleId} />
    </div>
      </Card>

      {/* Render the client component that fetches and displays documents */}
      <VehicleDetailsClient vehicleId={vehicleId} />
    </div>
    </TooltipProvider>
  );
}
