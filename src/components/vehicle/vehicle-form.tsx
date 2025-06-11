
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Vehicle } from "@/lib/types"; 
import { VEHICLE_TYPES } from "@/lib/constants"; 
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import React from "react";

const vehicleFormSchema = z.object({
  registrationNumber: z.string().min(3, "Registration number must be at least 3 characters.").max(20),
  type: z.string().min(2, "Vehicle type must be at least 2 characters.").max(50),
  make: z.string().min(2, "Make must be at least 2 characters.").max(50),
  model: z.string().min(1, "Model must be at least 1 character.").max(50),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

interface VehicleFormProps {
  initialData?: Vehicle | null;
  // The onSubmit prop now expects a function that will handle the server action call
  // and return a promise that might resolve to the vehicle or an error object.
  onSubmit: (data: VehicleFormValues) => Promise<Vehicle | { error: string } | undefined | void>;
  isEditing?: boolean;
}

export function VehicleForm({ initialData, onSubmit, isEditing = false }: VehicleFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const defaultValues = initialData
    ? {
        registrationNumber: initialData.registrationNumber,
        type: initialData.type,
        make: initialData.make,
        model: initialData.model,
      }
    : {
        registrationNumber: "",
        type: "",
        make: "",
        model: "",
      };

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues,
  });

  const handleFormSubmit = async (data: VehicleFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await onSubmit(data); // Call the server action passed via props

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        throw new Error(result.error);
      }
      
      toast({
        title: isEditing ? "Vehicle Updated" : "Vehicle Added",
        description: `Vehicle ${data.registrationNumber} has been successfully ${isEditing ? 'updated' : 'added'}.`,
      });
      
      // For edits, router.refresh() will be handled by revalidatePath in the server action.
      // For adds, a revalidatePath can also be called in the addVehicle server action.
      // Then navigate.
      router.push("/vehicles");
      router.refresh(); // Explicitly call refresh here to ensure client cache is updated after navigation.
                       // This is particularly useful if revalidatePath alone isn't sufficient for all client component updates.

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to ${isEditing ? 'update' : 'add'} vehicle.`;
      toast({
        title: "Error",
        description: errorMessage + " Please try again.",
        variant: "destructive",
      });
      console.error("Form submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto shadow-lg">
      <CardHeader>
        <CardTitle className="font-headline text-2xl">{isEditing ? "Edit Vehicle" : "Add New Vehicle"}</CardTitle>
        <CardDescription>
          {isEditing ? "Update the details of the vehicle." : "Fill in the details to add a new vehicle to your fleet."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="registrationNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registration Number</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., MH12AB3456" {...field} />
                  </FormControl>
                  <FormDescription>Enter the vehicle's registration number.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle Type</FormLabel>
                  <FormControl>
                     <Input
                      placeholder="e.g., Car, Truck, Custom Van"
                      {...field}
                      list="vehicle-type-suggestions"
                    />
                  </FormControl>
                   <datalist id="vehicle-type-suggestions">
                    {VEHICLE_TYPES.map((type) => (
                      <option key={type} value={type} />
                    ))}
                  </datalist>
                  <FormDescription>Choose from suggestions or enter a custom vehicle type.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="make"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Make</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Toyota, Ford" {...field} />
                  </FormControl>
                  <FormDescription>Enter the manufacturer of the vehicle.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Camry, F-150" {...field} />
                  </FormControl>
                  <FormDescription>Enter the model of the vehicle.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Add Vehicle"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
