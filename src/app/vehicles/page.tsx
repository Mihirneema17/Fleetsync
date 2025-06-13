"use client";


import Link from 'next/link';
// The following imports include React hooks and components
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, Loader2, Car } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getVehicles } from '@/lib/data';
import { VehicleListClient } from '@/components/vehicle/vehicle-list-client';
import { useAuth } from '@/contexts/auth-context';
import type { Vehicle } from '@/lib/types';

export default function VehiclesPage() {
  const { firebaseUser, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    // Auth guard is handled by AppLayout, but this ensures data fetch is tied to user state.
    if (!isAuthLoading && firebaseUser) {
      setIsLoadingData(true);
      getVehicles(firebaseUser.uid)
        .then((userVehicles) => {
          setVehicles(userVehicles);
        })
        .catch(error => {
          console.error("Failed to fetch vehicles:", error);
          setVehicles([]); // Set to empty on error
        })
        .finally(() => {
          setIsLoadingData(false);
        });
    } else if (!isAuthLoading && !firebaseUser) {
      // If auth is loaded and there's no user, stop the data loading state.
      // The AppLayout will handle the redirect.
      setIsLoadingData(false);
    }
  }, [firebaseUser, isAuthLoading, router]);

  // Combined loading state for a simpler UI check
  const showLoadingState = isAuthLoading || isLoadingData;

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

      {showLoadingState ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="ml-4 text-lg text-muted-foreground">Loading your vehicles...</p>
        </div>
      ) : (
        // Pass the fetched, user-specific vehicles to the client component for rendering
        <VehicleListClient initialVehicles={vehicles} />
      )}
    </div>
  );
}