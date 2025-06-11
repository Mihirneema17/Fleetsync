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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Vehicle } from "@/lib/types";
import { VEHICLE_TYPES } from "@/lib/constants";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import React from "react";

const vehicleFormSchema = z.object({
  registrationNumber: z.string().min(3, "Registration number must be at least 3 characters.").max(20),
  type: z.enum(VEHICLE_TYPES as [string, ...string[]], {
    required_error: "Vehicle type is required.",
  }),
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
        type: undefined, // Or a default like 'Car'
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
      router.push("/vehicles"); // Or to the vehicle's detail page
      router.refresh(); // Ensure the list is updated
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vehicle type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {VEHICLE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Choose the type of vehicle.</FormDescription>
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
