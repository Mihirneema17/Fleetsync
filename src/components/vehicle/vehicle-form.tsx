
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
import { useAuth } from "@/contexts/auth-context"; 
import { logger } from "@/lib/logger"; 

const vehicleFormSchema = z.object({
  registrationNumber: z.string()
    .trim()
    .min(3, "Registration number must be at least 3 characters long.")
    .max(15, "Registration number cannot exceed 15 characters.")
    .regex(
      /^(?=.*[A-Z])(?=.*\d)[A-Z][A-Z0-9]{2,14}$/,
      "Must start with a letter, include letters & numbers, and be uppercase alphanumeric (3-15 chars)."
    ),
  type: z.string().trim().min(2, "Vehicle type must be at least 2 characters.").max(50),
  make: z.string().trim().min(2, "Make must be at least 2 characters.").max(50),
  model: z.string().trim().min(1, "Model must be at least 1 character.").max(50),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

interface VehicleFormProps {
  initialData?: Vehicle | null;
  onSubmit: (
    data: VehicleFormValues,
    currentUserId: string | null
  ) => Promise<{ vehicle?: Vehicle; error?: string; redirectTo?: string } | void>; 
  isEditing?: boolean;
}

export function VehicleForm({ initialData, onSubmit, isEditing = false }: VehicleFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { firebaseUser, isLoading: isAuthLoading } = useAuth(); 

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
    logger.client.info("VehicleForm: handleFormSubmit triggered.", { isEditing, registrationNumber: data.registrationNumber });

    if (isAuthLoading) {
      logger.client.warn("VehicleForm: Auth state is still loading. Submission deferred.", { isEditing });
      toast({
        title: "Please Wait",
        description: "Authentication check in progress. Please try again shortly.",
        variant: "default",
      });
      setIsSubmitting(false);
      return;
    }

    if (!firebaseUser?.uid) {
      logger.client.error("VehicleForm: User not authenticated (firebaseUser or firebaseUser.uid is null/undefined). Cannot submit form.", { isEditing, firebaseUserExists: !!firebaseUser, uidExists: !!firebaseUser?.uid });
      toast({
        title: "Authentication Error",
        description: "You must be logged in to perform this action.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }
    
    logger.client.info("VehicleForm: User authenticated. Proceeding with submission.", { userId: firebaseUser.uid, isEditing });

    try {
      // The .toUpperCase() is handled by the input's onChange, but to be sure, we can do it here too.
      // However, the regex itself expects uppercase, so data passed to the server action should be uppercase.
      // The existing onChange already handles this: onChange={(e) => field.onChange(e.target.value.toUpperCase())}
      const processedData = data; 
      const result = await onSubmit(processedData, firebaseUser.uid); 

      if (result && result.error) {
        logger.client.error("VehicleForm: onSubmit (server action) returned an error.", { error: result.error, isEditing });
        throw new Error(result.error);
      }

      toast({
        title: isEditing ? "Vehicle Updated" : "Vehicle Added",
        description: `Vehicle ${processedData.registrationNumber} has been successfully ${isEditing ? 'updated' : 'added'}.`,
      });

      if (result && result.redirectTo) {
        router.push(result.redirectTo);
      } else {
        router.push("/vehicles");
      }
      router.refresh(); 

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to ${isEditing ? 'update' : 'add'} vehicle.`;
      logger.client.error("VehicleForm: Form submission error caught in try-catch.", { errorMessage, errorObj: error, isEditing });
      toast({
        title: "Error",
        description: errorMessage + " Please try again.",
        variant: "destructive",
      });
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
                    <Input
                      placeholder="e.g., MH12AB3456"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())} 
                     />
                  </FormControl>
                  <FormDescription>Enter the vehicle's registration number (e.g., UP16CA0000). It will be auto-uppercased.</FormDescription>
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
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting || isAuthLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isAuthLoading || !firebaseUser}>
                {(isSubmitting || isAuthLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Add Vehicle"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
