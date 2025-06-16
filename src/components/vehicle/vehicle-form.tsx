
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
import { useAuth } from "@/contexts/auth-context"; // Assuming auth-context is in this path
import { logger } from "@/lib/logger";
import { smartIngestDocument, SmartIngestOutput } from "@/ai/flows/smart-ingest-flow";
import { CardFooter } from "../ui/card";

const vehicleFormSchema = z.object({
  registrationNumber: z.string()
    .trim()
    .toUpperCase()
    .min(3, "Registration number must be at least 3 characters long.")
    .max(15, "Registration number cannot exceed 15 characters.")
    .regex(
      /^(?=.*[A-Z])(?=.*\d)[A-Z][A-Z0-9]{2,14}$/,
      "Must start with a letter, include letters & numbers, and be uppercase alphanumeric (3-15 chars)."
    ),
  type: z.string().trim().min(2, "Vehicle type must be at least 2 characters.").max(50),
  make: z.string().trim().min(2, "Make must be at least 2 characters.").max(50),
  model: z.string().trim().min(1, "Model must be at least 1 character.").max(50),
  registrationDocumentFile: z.any() // Use z.any() for FileList
    .optional()
    .nullable(),
});

export type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

interface VehicleFormProps {
  initialData?: Vehicle | null;
  onSubmit: ( 
    data: VehicleFormValues,
    aiData?: SmartIngestOutput | null, // Add AI data to onSubmit
    currentUserId: string | null
  ) => Promise<{ vehicle?: Vehicle; error?: string; redirectTo?: string } | void>; 
  isEditing?: boolean;
}

export function VehicleForm({ initialData, onSubmit, isEditing = false }: VehicleFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { firebaseUser, isLoading: isAuthLoading } = useAuth(); 
  const [aiExtraction, setAiExtraction] = React.useState<SmartIngestOutput | null>(null);
  const [aiExtractionApplied, setAiExtractionApplied] = React.useState(false); // State to track if AI data is applied to form
  const [isExtracting, setIsExtracting] = React.useState(false);

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
        registrationDocumentFile: undefined, // Ensure this is undefined for new forms
      };

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues,
  });

  const handleFileChange = async (files: FileList | null) => {
    form.setValue("registrationDocumentFile", files);
    setAiExtraction(null); 
    setAiExtractionApplied(false); // Reset applied state

    if (files && files.length > 0) {
      const file = files[0];
      if (file) {
        setIsExtracting(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUri = reader.result as string;
          try {
            const extractionResult = await smartIngestDocument({ documentDataUri: dataUri });
            setAiExtraction(extractionResult);
          } catch (error) {
            logger.client.error("AI Extraction failed:", error);
            toast({ title: "Extraction Failed", description: "Could not extract data from the document.", variant: "destructive" });
          } finally {
            setIsExtracting(false);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const applyAiExtraction = () => {
    if (aiExtraction) {
      if (aiExtraction.vehicleRegistrationNumber) form.setValue("registrationNumber", aiExtraction.vehicleRegistrationNumber.toUpperCase());
      if (aiExtraction.vehicleTypeSuggestion) form.setValue("type", aiExtraction.vehicleTypeSuggestion);
      if (aiExtraction.vehicleMakeSuggestion) form.setValue("make", aiExtraction.vehicleMakeSuggestion);
      if (aiExtraction.vehicleModelSuggestion) form.setValue("model", aiExtraction.vehicleModelSuggestion);
      // Note: StartDate and ExpiryDate are not form fields for Vehicle itself, but are for VehicleDocument
      // They will be passed to the server action and handled in data.ts
      setAiExtractionApplied(true);
      toast({ title: "Extracted Data Applied", description: "Form fields pre-filled with AI data." });
    }
  };

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
      const processedData = {...data}; // Create a copy

      // Pass the file data along with other form values
      const result = await onSubmit({
        ...processedData,
        registrationDocumentFile: data.registrationDocumentFile,
      }, aiExtraction, firebaseUser.uid); // Pass AI data here

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
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())} // Ensure uppercase
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
             {!isEditing && ( // Only show file upload on add form
              <FormField
                control={form.control}
                name="registrationDocumentFile"
                render={({ field: { value, onChange, ...fieldProps } }) => (
                  <FormItem>
                    <FormLabel>
                      Vehicle Registration Document (Optional)
                      {isExtracting && <Loader2 className="ml-2 h-4 w-4 inline-block animate-spin" />}
                    </FormLabel>

                    <FormControl>
                      <Input {...fieldProps} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => onChange(event.target.files)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {aiExtraction && !isEditing && !aiExtractionApplied && ( // Only show if extraction exists, not editing, and not yet applied
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-lg font-headline">Extracted Details from Document</CardTitle>
                  <CardDescription>Review and confirm the details extracted by AI. These will pre-fill the form.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Registration Number:</p>
                      <p className="text-base">{aiExtraction.vehicleRegistrationNumber || 'Not found'}</p>
                      {aiExtraction.vehicleRegistrationNumberConfidence && (
                        <p className="text-xs text-gray-500">Confidence: {(aiExtraction.vehicleRegistrationNumberConfidence * 100).toFixed(1)}%</p>
                      )}
                    </div>
                    <div>
                       <p className="text-sm font-medium text-gray-700">Suggested Document Type:</p>
                      <p className="text-base">{aiExtraction.documentTypeSuggestion || 'Not found'}</p>
                       {aiExtraction.documentTypeConfidence && (
                        <p className="text-xs text-gray-500">Confidence: {(aiExtraction.documentTypeConfidence * 100).toFixed(1)}%</p>
                      )}
                       {aiExtraction.customTypeNameSuggestion && (
                        <p className="text-xs text-gray-500">Custom Type: {aiExtraction.customTypeNameSuggestion}</p>
                      )}
                    </div>
                   <div>
                      <p className="text-sm font-medium text-gray-700">Suggested Vehicle Type:</p>
                      <p className="text-base">{aiExtraction.vehicleTypeSuggestion || 'Not found'}</p>
                      {aiExtraction.vehicleTypeConfidence && (
                        <p className="text-xs text-gray-500">Confidence: {(aiExtraction.vehicleTypeConfidence * 100).toFixed(1)}%</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Suggested Make:</p>
                      <p className="text-base">{aiExtraction.vehicleMakeSuggestion || 'Not found'}</p>
                       {aiExtraction.vehicleMakeConfidence && (
                        <p className="text-xs text-gray-500">Confidence: {(aiExtraction.vehicleMakeConfidence * 100).toFixed(1)}%</p>
                      )}
                    </div>
                     <div>
                      <p className="text-sm font-medium text-gray-700">Suggested Model:</p>
                      <p className="text-base">{aiExtraction.vehicleModelSuggestion || 'Not found'}</p>
                       {aiExtraction.vehicleModelConfidence && (
                        <p className="text-xs text-gray-500">Confidence: {(aiExtraction.vehicleModelConfidence * 100).toFixed(1)}%</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Start Date (Reg/Issue):</p>
                      <p className="text-base">{aiExtraction.startDate || 'Not found'}</p>
                       {aiExtraction.startDateConfidence && (
                        <p className="text-xs text-gray-500">Confidence: {(aiExtraction.startDateConfidence * 100).toFixed(1)}%</p>
                      )}
                    </div>
                     <div>
                      <p className="text-sm font-medium text-gray-700">Expiry/Valid Upto Date:</p>
                      <p className="text-base">{aiExtraction.expiryDate || 'Not found'}</p>
                       {aiExtraction.expiryDateConfidence && (
                        <p className="text-xs text-gray-500">Confidence: {(aiExtraction.expiryDateConfidence * 100).toFixed(1)}%</p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" onClick={applyAiExtraction}>
                      Apply Extracted Data
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting || isAuthLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isAuthLoading || !firebaseUser || (aiExtraction && !aiExtractionApplied)}>
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
