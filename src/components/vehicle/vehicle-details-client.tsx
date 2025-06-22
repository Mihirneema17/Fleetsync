"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { getVehicleById } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { VehicleDocumentManager } from './vehicle-document-manager';
import { extractExpiryDate } from '@/ai/flows/extract-expiry-date'; // Assuming extractExpiryDate is needed here
import { Loader2 } from 'lucide-react';
import { notFound } from 'next/navigation';

interface VehicleDetailsClientProps {
  vehicleId: string;
}

export default function VehicleDetailsClient({ vehicleId }: VehicleDetailsClientProps) {
  const { firebaseUser, isLoading: isAuthLoading } = useAuth();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isLoadingVehicle, setIsLoadingVehicle] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthLoading) {
      if (firebaseUser) {
        setIsLoadingVehicle(true);
        getVehicleById(vehicleId, firebaseUser.uid)
          .then(data => {
            if (data) {
              setVehicle(data);
            } else {
              // Vehicle not found or user not authorized
              notFound(); // Use Next.js notFound
            }
          })
          .catch(err => {
            console.error("Failed to fetch vehicle details:", err);
            setError("Failed to load vehicle details.");
          })
          .finally(() => {
            setIsLoadingVehicle(false);
          });
      } else {
        // Auth loaded, but no user - redirection is handled by AppLayout
        setIsLoadingVehicle(false);
      }
    }
  }, [vehicleId, firebaseUser, isAuthLoading]);

  if (isAuthLoading || isLoadingVehicle) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading vehicle details...</p>
      </div>
    );
  }

  if (error) {
    return <div className="text-center text-destructive">{error}</div>;
  }

  if (!vehicle) {
      // This case should ideally be handled by notFound() in the useEffect,
      // but as a fallback, return null or an error message.
      return null; // Or render a specific not found message
  }

  return (
    <VehicleDocumentManager
      vehicle={vehicle}
      extractExpiryDate={extractExpiryDate} // Pass the AI function
    />
  );
}