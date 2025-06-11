
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
import type { Vehicle, VehicleType } from "@/lib/types"; // VehicleType is now string
import { VEHICLE_TYPES } from "@/lib/constants"; // This is now a list of suggestions
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import React from "react";

const vehicleFormSchema = z.object({
  registrationNumber: z.string().min(3, "Registration number must be at least 3 characters.").max(20),
  type: z.string().min(2, "Vehicle type must be at least 2 characters.").max(50), // Changed from enum to string
  make: z.string().min(2, "Make must be at least 2 characters.").max(50),
  model: z.string().min(1, "Model must be at least 1 character.").max(50),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

interface VehicleFormProps {
  initialData?: Vehicle | null;
  onSubmit: (data: VehicleFormValues) => Promise<Vehicle | undefined | void>;
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

  const handleSubmit = async (data: VehicleFormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      toast({
        title: isEditing ? "Vehicle Updated" : "Vehicle Added",
        description: `Vehicle ${data.registrationNumber} has been successfully ${isEditing ? 'updated' : 'added'}.`,
      });
      router.push("/vehicles");
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${isEditing ? 'update' : 'add'} vehicle. Please try again.`,
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
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
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
