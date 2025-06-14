
"use client"; 

import Link from 'next/link';
import { useSearchParams } from 'next/navigation'; // For reading URL params
import { Car, AlertTriangle, CheckCircle2, Clock, MoreHorizontal, Trash2, PlusCircle } from 'lucide-react';
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
import { getDocumentComplianceStatus, getLatestDocumentForType } from '@/lib/utils'; 
import type { Vehicle, DocumentType, VehicleDocument } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import React, { useState, useTransition, useEffect, useMemo } from 'react';
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { handleDeleteVehicleServerAction } from '@/app/vehicles/actions';
import { format, parseISO, differenceInDays } from 'date-fns';
import { DATE_FORMAT } from '@/lib/constants';
import { motion } from 'framer-motion';

const getOverallVehicleStatusBadge = (vehicle: Vehicle): { status: 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'MissingInfo', variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: React.ElementType } => {
  let hasOverdue = false;
  let hasExpiringSoon = false;
  let hasMissing = false;

  const relevantDocTypes: DocumentType[] = ['Insurance', 'Fitness', 'PUC', 'AITP'];
  const activeDocs = relevantDocTypes
    .map(docType => getLatestDocumentForType(vehicle, docType))
    .filter(doc => doc && doc.expiryDate);

  if (activeDocs.length === 0 && vehicle.documents.some(d => d.status === 'Missing')) {
      hasMissing = true;
  } else {
     const essentialTypes = ['Insurance', 'Fitness', 'PUC']; 
     let missingEssentialCount = 0;
     for (const type of essentialTypes as DocumentType[]) {
        if (!getLatestDocumentForType(vehicle, type)?.expiryDate) {
            missingEssentialCount++;
        }
     }
     if (missingEssentialCount > 0 && activeDocs.length < essentialTypes.length) {
        hasMissing = true;
     }
  }

  activeDocs.forEach(doc => {
    if(doc && doc.expiryDate) {
      const status = getDocumentComplianceStatus(doc.expiryDate);
      if (status === 'Overdue') hasOverdue = true;
      else if (status === 'ExpiringSoon') hasExpiringSoon = true;
    } else {
      hasMissing = true;
    }
  });

  if (hasOverdue) return { status: 'Overdue', variant: 'destructive', icon: AlertTriangle };
  if (hasExpiringSoon) return { status: 'ExpiringSoon', variant: 'secondary', icon: Clock };
  if (hasMissing) return { status: 'MissingInfo', variant: 'outline', icon: AlertTriangle };
  return { status: 'Compliant', variant: 'default', icon: CheckCircle2 };
};

const getStatusConfigForCell = (status: VehicleDocument['status']) => {
  switch (status) {
    case 'Compliant':
      return { icon: CheckCircle2, color: 'text-green-600', badgeVariant: 'default' as const };
    case 'ExpiringSoon':
      return { icon: Clock, color: 'text-yellow-600', badgeVariant: 'secondary' as const };
    case 'Overdue':
      return { icon: AlertTriangle, color: 'text-red-600', badgeVariant: 'destructive' as const };
    case 'Missing':
    default:
      return { icon: AlertTriangle, color: 'text-orange-500', badgeVariant: 'outline' as const };
  }
};

const documentTypesForTable: DocumentType[] = ['Insurance', 'Fitness', 'AITP', 'PUC'];

interface VehicleListClientProps {
  initialVehicles: Vehicle[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05, // Delay between each child
      delayChildren: 0.1,    // Initial delay for the container's children
    },
  },
};

const itemVariants = {
  hidden: { y: 15, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 120,
      damping: 12,
    },
  },
};

export function VehicleListClient({ initialVehicles }: VehicleListClientProps) {
  const searchParams = useSearchParams();
  const newVehicleId = searchParams.get('new');

  const [vehiclesByType, setVehiclesByType] = useState<Record<string, Vehicle[]>>({});
  const [isLoading, setIsLoading] = useState(false); 
  const [isDeleting, startDeleteTransition] = useTransition();
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [openAccordionItems, setOpenAccordionItems] = useState<string[]>([]);
  const { toast } = useToast();

  const groupedVehicles = useMemo(() => {
    const grouped: Record<string, Vehicle[]> = {};
    initialVehicles.forEach(vehicle => {
      const typeKey = vehicle.type || 'Uncategorized';
      if (!grouped[typeKey]) {
        grouped[typeKey] = [];
      }
      grouped[typeKey].push(vehicle);
    });
    return grouped;
  }, [initialVehicles]);

  useEffect(() => {
    setVehiclesByType(groupedVehicles);
    const typeKeys = Object.keys(groupedVehicles);
    if (typeKeys.length > 0) {
      const defaultOpen = typeKeys.slice(0, 2); // Open first two by default
      if (newVehicleId) {
        const typeOfNewVehicle = initialVehicles.find(v => v.id === newVehicleId)?.type;
        if (typeOfNewVehicle && !defaultOpen.includes(typeOfNewVehicle)) {
          defaultOpen.push(typeOfNewVehicle);
        }
      }
      setOpenAccordionItems(defaultOpen);
    } else {
      setOpenAccordionItems([]);
    }
  }, [groupedVehicles, newVehicleId, initialVehicles]);


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
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
      setIsConfirmDeleteDialogOpen(false);
      setVehicleToDelete(null);
    });
  };

  const renderDocumentStatusCell = (vehicle: Vehicle, docType: DocumentType) => {
    const latestDoc = getLatestDocumentForType(vehicle, docType);
    
    if (latestDoc && latestDoc.expiryDate) {
      const status = getDocumentComplianceStatus(latestDoc.expiryDate);
      const config = getStatusConfigForCell(status);
      const StatusIcon = config.icon;
      const expiry = parseISO(latestDoc.expiryDate);
      const now = new Date();
      now.setHours(0,0,0,0); 
      const daysDiff = differenceInDays(expiry, now); 
  
      return (
        <div className="flex flex-col items-start text-left">
          <Badge 
            variant={config.badgeVariant} 
            className={cn(
              "text-xs mb-0.5 whitespace-nowrap",
              status === 'ExpiringSoon' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : '',
              status === 'Compliant' ? 'bg-green-100 text-green-800 border-green-300' : ''
            )}
          >
            <StatusIcon className={cn("mr-1 h-3 w-3", config.color)} />
            {status}
          </Badge>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {format(expiry, DATE_FORMAT)}
          </span>
          <span className={cn("text-[11px] whitespace-nowrap",
             daysDiff < 0 ? 'text-red-600 font-medium' : 'text-muted-foreground',
             daysDiff >=0 && daysDiff < 30 && 'text-yellow-600 font-medium'
          )}>
            {daysDiff < 0 ? `${Math.abs(daysDiff)}d overdue` : `${daysDiff}d left`}
          </span>
        </div>
      );
    }
    return <Badge variant="outline" className="text-xs whitespace-nowrap">Missing</Badge>;
  };
  
  if (isLoading) { 
    return (
      <div className="flex justify-center items-center h-64">
        <Car className="w-12 h-12 animate-pulse text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading vehicles...</p>
      </div>
    );
  }

  const totalVehicles = Object.values(vehiclesByType).reduce((sum, list) => sum + list.length, 0);

  return (
    <>
      {totalVehicles === 0 ? (
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
            <CardTitle>Vehicle Fleet Overview</CardTitle>
            <CardDescription>
              {totalVehicles} vehicle(s) grouped by type. Click on a type to expand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion 
                type="multiple" 
                value={openAccordionItems}
                onValueChange={setOpenAccordionItems}
                className="w-full"
            >
              {Object.entries(vehiclesByType).sort(([typeA], [typeB]) => typeA.localeCompare(typeB)).map(([type, vehicleList]) => (
                <AccordionItem value={type} key={type}>
                  <AccordionTrigger className="text-lg font-semibold hover:no-underline px-1 py-3">
                    <div className="flex items-center gap-2">
                        <Car className="h-5 w-5 text-primary"/> 
                        {type} ({vehicleList.length})
                        {vehicleList.length > 0 && 
                            <Badge 
                                variant={getOverallVehicleStatusBadge(vehicleList[0]).variant} 
                                className={cn("ml-2", 
                                    getOverallVehicleStatusBadge(vehicleList[0]).status === 'ExpiringSoon' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : '',
                                    getOverallVehicleStatusBadge(vehicleList[0]).status === 'Compliant' ? 'bg-green-100 text-green-800 border-green-300' : ''
                                )}
                            >
                                <span className="hidden sm:inline">{getOverallVehicleStatusBadge(vehicleList[0]).status}</span>
                            </Badge>
                        }
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-0 pb-2">
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[120px]">Registration No.</TableHead>
                          <TableHead className="min-w-[150px]">Make & Model</TableHead>
                          {documentTypesForTable.map(docType => (
                            <TableHead key={docType} className="min-w-[130px] text-center">{docType}</TableHead>
                          ))}
                          <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <motion.tbody
                        initial="hidden"
                        animate={openAccordionItems.includes(type) ? "visible" : "hidden"}
                        variants={containerVariants}
                      >
                        {vehicleList.map((vehicle) => (
                            <motion.tr 
                                key={vehicle.id}
                                variants={itemVariants}
                                layout // For smooth re-flows if list order changes dynamically
                                className={cn(
                                    "border-b transition-colors duration-150 ease-out hover:bg-muted/50 data-[state=selected]:bg-muted hover:shadow-sm",
                                    vehicle.id === newVehicleId ? 'highlight-new-item' : ''
                                  )}
                            >
                              <TableCell className="font-medium">{vehicle.registrationNumber}</TableCell>
                              <TableCell>{vehicle.make} {vehicle.model}</TableCell>
                              {documentTypesForTable.map(docType => (
                                <TableCell key={docType} className="text-center">
                                  {renderDocumentStatusCell(vehicle, docType)}
                                </TableCell>
                              ))}
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
                            </motion.tr>
                          ))}
                      </motion.tbody>
                    </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
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
    </>
  );
}
