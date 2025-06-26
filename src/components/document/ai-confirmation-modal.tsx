
"use client";

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, isValid } from 'date-fns';
import { DATE_FORMAT, DOCUMENT_TYPES, VEHICLE_TYPES } from '@/lib/constants';
import type { DocumentType } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle as InfoCardTitle } from '@/components/ui/card'; // Renamed to avoid conflict

export interface AIConfirmationData {
  // Fields from SmartIngestOutput
  vehicleRegistrationNumber?: string | null;
  vehicleRegistrationNumberConfidence?: number | null;
  documentTypeSuggestion?: DocumentType | 'Other' | 'Unknown' | null;
  documentTypeConfidence?: number | null;
  customTypeNameSuggestion?: string | null;

  // Fields from ExtractExpiryDateOutput (and SmartIngestOutput)
  policyNumber?: string | null;
  policyNumberConfidence?: number | null;
  startDate?: string | null; // ISO Date string from AI
  startDateConfidence?: number | null;
  expiryDate?: string | null; // ISO Date string from AI
  expiryDateConfidence?: number | null; // For expiryDate in SmartIngest, 'confidence' in ExtractExpiryDate

  // New vehicle detail fields
  vehicleMakeSuggestion?: string | null;
  vehicleMakeConfidence?: number | null;
  vehicleModelSuggestion?: string | null;
  vehicleModelConfidence?: number | null;
  vehicleTypeSuggestion?: string | null;
  vehicleTypeConfidence?: number | null;
}

export interface AIConfirmedValues {
  vehicleRegistrationNumber?: string | null;
  documentType?: DocumentType | 'Other' | 'Unknown' | null;
  customTypeName?: string | null;
  policyNumber?: string | null;
  startDate?: Date | null; // Date object for form
  expiryDate?: Date | null; // Date object for form
  userNotes?: string | null;

  // New vehicle detail fields
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleType?: string | null;
}

// Schema for the confirmation form
const confirmationFormSchema = z.object({
  vehicleRegistrationNumber: z.string().trim().max(20, "Reg. number too long.").regex(/^[A-Z0-9]*$/, "Reg. number must be alphanumeric uppercase.").optional().nullable(),
  documentType: z.enum([...DOCUMENT_TYPES, 'Unknown'] as [string, ...string[]]).optional().nullable(),
  customTypeName: z.string().trim().max(50, "Custom type name too long.").optional().nullable(),
  policyNumber: z.string().trim().max(50, "Policy number too long.").optional().nullable(),
  startDate: z.date().optional().nullable(),
  expiryDate: z.date().optional().nullable(),
  userNotes: z.string().trim().max(250, "Notes too long.").optional().nullable(),

  // New vehicle detail fields
  vehicleMake: z.string().trim().min(2, "Make must be at least 2 chars.").max(50, "Make too long.").optional().nullable(),
  vehicleModel: z.string().trim().min(1, "Model must be at least 1 char.").max(50, "Model too long.").optional().nullable(),
  vehicleType: z.string().trim().min(2, "Type must be at least 2 chars.").max(50, "Type too long.").optional().nullable(),

}).refine(data => {
  if (data.documentType === 'Other') {
    return !!data.customTypeName && data.customTypeName.trim().length > 0;
  }
  return true;
}, {
  message: "Custom name required if type is 'Other'.",
  path: ["customTypeName"],
}).refine(data => {
  if (data.startDate && data.expiryDate && data.startDate > data.expiryDate) {
    return false;
  }
  return true;
}, {
  message: "Start date cannot be after expiry date.",
  path: ["startDate"],
});

type ConfirmationFormValues = z.infer<typeof confirmationFormSchema>;

interface AIConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiData: AIConfirmationData;
  onConfirm: (confirmedData: AIConfirmedValues) => void;
  isLoading?: boolean;
  // To control which fields are shown/editable
  showVehicleRegistration?: boolean;
  showDocumentType?: boolean;
  showVehicleDetails?: boolean;
}

export function AIConfirmationModal({
  isOpen,
  onClose,
  aiData,
  onConfirm,
  isLoading = false,
  showVehicleRegistration = false,
  showDocumentType = false,
  showVehicleDetails = false,
}: AIConfirmationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isExpiryDatePickerOpen, setIsExpiryDatePickerOpen] = useState(false);

  const form = useForm<ConfirmationFormValues>({
    resolver: zodResolver(confirmationFormSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (isOpen && aiData) {
      form.reset({
        vehicleRegistrationNumber: aiData.vehicleRegistrationNumber ? aiData.vehicleRegistrationNumber.toUpperCase() : null,
        documentType: aiData.documentTypeSuggestion && DOCUMENT_TYPES.includes(aiData.documentTypeSuggestion as DocumentType)
          ? aiData.documentTypeSuggestion as DocumentType
          : (aiData.documentTypeSuggestion === 'Unknown' ? 'Unknown' : (showDocumentType ? 'Other' : undefined)),
        customTypeName: (aiData.documentTypeSuggestion === 'Other' || aiData.documentTypeSuggestion === 'Unknown')
          ? aiData.customTypeNameSuggestion
          : (showDocumentType && aiData.documentTypeSuggestion && !DOCUMENT_TYPES.includes(aiData.documentTypeSuggestion as DocumentType) ? aiData.documentTypeSuggestion : null),
        policyNumber: aiData.policyNumber,
        startDate: aiData.startDate && isValid(parseISO(aiData.startDate)) ? parseISO(aiData.startDate) : null,
        expiryDate: aiData.expiryDate && isValid(parseISO(aiData.expiryDate)) ? parseISO(aiData.expiryDate) : null,
        userNotes: '',
        // Set new vehicle details
        vehicleMake: aiData.vehicleMakeSuggestion,
        vehicleModel: aiData.vehicleModelSuggestion,
        vehicleType: aiData.vehicleTypeSuggestion,
      });
    }
  }, [isOpen, aiData, form, showDocumentType]);

  const watchedDocumentType = form.watch("documentType");

  const handleSubmit = (values: ConfirmationFormValues) => {
    setIsSubmitting(true);
    onConfirm(values);
    setIsSubmitting(false);
    // onClose(); // Parent component will handle closing after onConfirm logic
  };

  const ConfidenceDisplay: React.FC<{ score: number | null | undefined; prefix?: string }> = ({ score, prefix = "AI Conf:" }) => {
    if (score === null || score === undefined) return null;
    const formattedScore = (score * 100).toFixed(0);
    return <FormDescription className="text-xs text-blue-600 mt-0.5">{prefix} {formattedScore}%</FormDescription>;
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center">
            <CheckCircle className="mr-2 h-6 w-6 text-green-500" /> Confirm AI Extracted Details
          </DialogTitle>
          <DialogDescription>
            Please review the details extracted by AI. Correct any inaccuracies and add notes if needed.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] p-1 pr-2">
            <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-2">
                {isLoading ? (
                    <div className="flex items-center justify-center p-8 space-x-2 text-primary">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <span>Loading AI suggestions...</span>
                    </div>
                ) : (
                <>
                {showVehicleRegistration && (
                    <FormField
                        control={form.control}
                        name="vehicleRegistrationNumber"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Vehicle Registration Number</FormLabel>
                            <FormControl>
                            <Input
                                placeholder="e.g., MH12AB1234"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                            </FormControl>
                            <ConfidenceDisplay score={aiData.vehicleRegistrationNumberConfidence} />
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                )}
                
                {showVehicleDetails && (
                  <div className='space-y-4 p-4 border rounded-md'>
                    <h3 className='text-sm font-medium text-muted-foreground'>Vehicle Details</h3>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <FormField
                          control={form.control}
                          name="vehicleMake"
                          render={({ field }) => (
                          <FormItem>
                              <FormLabel>Vehicle Make</FormLabel>
                              <FormControl>
                                  <Input placeholder="e.g., Tata Motors" {...field} value={field.value ?? ''} />
                              </FormControl>
                              <ConfidenceDisplay score={aiData.vehicleMakeConfidence} />
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                      <FormField
                          control={form.control}
                          name="vehicleModel"
                          render={({ field }) => (
                          <FormItem>
                              <FormLabel>Vehicle Model</FormLabel>
                              <FormControl>
                                  <Input placeholder="e.g., Nexon" {...field} value={field.value ?? ''} />
                              </FormControl>
                              <ConfidenceDisplay score={aiData.vehicleModelConfidence} />
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                      </div>
                      <FormField
                          control={form.control}
                          name="vehicleType"
                          render={({ field }) => (
                          <FormItem>
                              <FormLabel>Vehicle Type</FormLabel>
                              <FormControl>
                                  <Input placeholder="e.g., Car, SUV" {...field} value={field.value ?? ''} list="vehicle-type-suggestions" />
                              </FormControl>
                               <datalist id="vehicle-type-suggestions">
                                {VEHICLE_TYPES.map((type) => (
                                  <option key={type} value={type} />
                                ))}
                              </datalist>
                              <ConfidenceDisplay score={aiData.vehicleTypeConfidence} />
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                  </div>
                )}


                {showDocumentType && (
                    <>
                    <FormField
                        control={form.control}
                        name="documentType"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Document Type</FormLabel>
                            <select
                                {...field}
                                value={field.value ?? undefined}
                                onChange={(e) => field.onChange(e.target.value as DocumentType | 'Unknown')}
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="" disabled>Select document type</option>
                                {DOCUMENT_TYPES.map((type) => (
                                <option key={type} value={type}>{type}</option>
                                ))}
                                <option value="Unknown">Unknown</option>
                            </select>
                            <ConfidenceDisplay score={aiData.documentTypeConfidence} />
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    {watchedDocumentType === 'Other' && (
                        <FormField
                        control={form.control}
                        name="customTypeName"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Custom Document Name</FormLabel>
                            <FormControl>
                                <Input placeholder="e.g., Road Tax Receipt" {...field} value={field.value ?? ''}/>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    )}
                    {(watchedDocumentType !== 'Other' && aiData?.customTypeNameSuggestion && aiData?.documentTypeSuggestion && !DOCUMENT_TYPES.includes(aiData.documentTypeSuggestion as DocumentType) ) && (
                        <FormDescription className="text-xs text-blue-600">
                            AI suggested type: '{aiData.documentTypeSuggestion}'.Mapped to 'Other'. Original AI name: '{aiData.customTypeNameSuggestion}'.
                        </FormDescription>
                    )}
                    </>
                )}

                <FormField
                    control={form.control}
                    name="policyNumber"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Policy / Document Number</FormLabel>
                        <FormControl>
                        <Input placeholder="Policy or document number" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <ConfidenceDisplay score={aiData.policyNumberConfidence} />
                        <FormMessage />
                    </FormItem>
                    )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Start Date</FormLabel>
                        <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button
                                variant={"outline"}
                                className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                >
                                {field.value ? format(field.value, DATE_FORMAT) : <span>Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => { field.onChange(date); setIsStartDatePickerOpen(false); }}
                                initialFocus
                            />
                            </PopoverContent>
                        </Popover>
                        <ConfidenceDisplay score={aiData.startDateConfidence} />
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="expiryDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Expiry Date</FormLabel>
                        <Popover open={isExpiryDatePickerOpen} onOpenChange={setIsExpiryDatePickerOpen}>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button
                                variant={"outline"}
                                className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                >
                                {field.value ? format(field.value, DATE_FORMAT) : <span>Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => { field.onChange(date); setIsExpiryDatePickerOpen(false);}}
                                initialFocus
                            />
                            </PopoverContent>
                        </Popover>
                        <ConfidenceDisplay score={aiData.expiryDateConfidence} />
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                </>
                )}

                <FormField
                    control={form.control}
                    name="userNotes"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Verification Notes (Optional)</FormLabel>
                        <FormControl>
                            <Textarea
                            placeholder="e.g., AI missed the correct expiry year, corrected from suggestion."
                            className="resize-none"
                            {...field}
                            value={field.value ?? ''}
                            />
                        </FormControl>
                        <FormDescription>
                            Add any notes about the verification process or corrections made.
                        </FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />

                <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting || isLoading}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || isLoading || !form.formState.isDirty && !form.formState.isValid}> {/* Allow submit if valid even if not dirty */}
                    {isSubmitting || isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                    Confirm Details
                </Button>
                </DialogFooter>
            </form>
            </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
