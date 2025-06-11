
"use client"; // Required for useState, AlertDialog, and client-side interactions

import Link from 'next/link';
import { PlusCircle, Car, AlertTriangle, CheckCircle2, Clock, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getVehicles, getDocumentComplianceStatus } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import React, { useState, useTransition, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { handleDeleteVehicleServerAction } from './actions';


const getOverallVehicleStatusBadge = (vehicle: Vehicle): { status: 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'MissingInfo', variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: React.ElementType } => {
  let hasOverdue = false;
  let hasExpiringSoon = false;
  let hasMissing = false;

  if (!vehicle.documents || vehicle.documents.length === 0) {
    return { status: 'MissingInfo', variant: 'outline', icon: AlertTriangle };
  }

  vehicle.documents.forEach(doc => {
    const status = getDocumentComplianceStatus(doc.expiryDate);
    if (status === 'Overdue') hasOverdue = true;
    else if (status === 'ExpiringSoon') hasExpiringSoon = true;
    else if (status === 'Missing') hasMissing = true;
  });

  if (hasOverdue) return { status: 'Overdue', variant: 'destructive', icon: AlertTriangle };
  if (hasExpiringSoon) return { status: 'ExpiringSoon', variant: 'secondary', icon: Clock };
  if (hasMissing) return { status: 'MissingInfo', variant: 'outline', icon: AlertTriangle };
  return { status: 'Compliant', variant: 'default', icon: CheckCircle2 };
};


export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchVehicles() {
      setIsLoading(true);
      const fetchedVehicles = await getVehicles();
      setVehicles(fetchedVehicles);
      setIsLoading(false);
    }
    fetchVehicles();
  }, []);

  const handleDeleteClick = (vehicle: Vehicle) => {
    setVehicleToDelete(vehicle);
    setIsConfirmDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!vehicleToDelete) return;

    startDeleteTransition(async () => {
      const result = await handleDeleteVehicleServerAction(vehicleToDelete.id);
      if (result.success) {
        toast({ title: "Vehicle Deleted", description: `Vehicle ${vehicleToDelete.registrationNumber} has been deleted.` });
        // Refresh data
        const updatedVehicles = await getVehicles();
        setVehicles(updatedVehicles);
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
      setIsConfirmDeleteDialogOpen(false);
      setVehicleToDelete(null);
    });
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Car className="w-12 h-12 animate-pulse text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading vehicles...</p>
      </div>
    );
  }


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

      {vehicles.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
            <Car className="w-20 h-20 text-muted-foreground mb-6" />
            <CardTitle className="text-2xl font-semibold mb-2 font-headline">No Vehicles Found</CardTitle>
            <CardDescription className="mb-6 text-muted-foreground">
              Get started by adding your first vehicle to the fleet.
            </CardDescription>
            <Link href="/vehicles/add">
              <Button size="lg">
                <PlusCircle className="mr-2 h-5 w-5" />
                Add Your First Vehicle
              </Button>
            </Link>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Vehicle Fleet</CardTitle>
            <CardDescription>A list of all vehicles in your fleet ({vehicles.length} total).</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registration No.</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Make & Model</TableHead>
                  <TableHead>Compliance Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((vehicle) => {
                  const statusInfo = getOverallVehicleStatusBadge(vehicle);
                  const StatusIcon = statusInfo.icon;
                  return (
                    <TableRow key={vehicle.id}>
                      <TableCell className="font-medium">{vehicle.registrationNumber}</TableCell>
                      <TableCell>{vehicle.type}</TableCell>
                      <TableCell>{vehicle.make} {vehicle.model}</TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant} className={cn(
                          statusInfo.status === 'ExpiringSoon' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : '',
                          statusInfo.status === 'Compliant' ? 'bg-green-100 text-green-800 border-green-300' : ''
                        )}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusInfo.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/vehicles/${vehicle.id}`}>View Details</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                               <Link href={`/vehicles/${vehicle.id}/edit`}>Edit Vehicle</Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 hover:!bg-red-500 hover:!text-white focus:!bg-red-500 focus:!text-white"
                              onClick={() => handleDeleteClick(vehicle)}
                              disabled={isDeleting}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Vehicle
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
       <AlertDialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the vehicle
              <span className="font-semibold"> {vehicleToDelete?.registrationNumber} </span>
              and all its associated documents and alerts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Yes, delete vehicle"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
