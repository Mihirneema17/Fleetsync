
"use client";

import React, { useState, useEffect } from 'react';
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
  DialogClose,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, AlertCircle, UploadCloud, CalendarIcon, Info } from 'lucide-react';
import { smartIngestDocument, type SmartIngestOutput } from '@/ai/flows/smart-ingest-flow';
import { useToast } from '@/hooks/use-toast';
import { DOCUMENT_TYPES, DATE_FORMAT } from '@/lib/constants';
import type { DocumentType } from '@/lib/types';
import { format, parseISO, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { processSmartDocumentAndSave } from '@/app/vehicles/actions';
import { useRouter } from 'next/navigation';
import { AIConfirmationModal, type AIConfirmationData, type AIConfirmedValues } from './ai-confirmation-modal'; // Import the new modal
import { logger } from '@/lib/logger';

const generateClientSideId = () => Math.random().toString(36).substr(2, 9);

const smartIngestFormSchema = z.object({
  vehicleRegistrationNumber: z.string().trim().min(1, "Vehicle registration is required.").max(20, "Registration number too long.").regex(/^[A-Z0-9]+$/, "Registration number must be alphanumeric and uppercase.").nullable(),
  documentType: z.enum(DOCUMENT_TYPES as [string, ...string[]], {
    required_error: "Document type is required.",
  }),
  customTypeName: z.string().trim().max(50, "Custom type name too long.").optional().nullable(),
  policyNumber: z.string().trim().max(50, "Policy number too long.").optional().nullable(),
  startDate: z.date().optional().nullable(),
  expiryDate: z.date().nullable().refine(val => val !== null, { message: "Expiry date is required." }),
}).refine(data => {
  if (data.documentType === 'Other') {
    return !!data.customTypeName && data.customTypeName.trim().length > 0;
  }
  return true;
}, {
  message: "Custom type name is required for 'Other' document type.",
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

export type SmartIngestFormValues = z.infer<typeof smartIngestFormSchema>;

interface SmartDocumentIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SmartDocumentIngestionModal({
  isOpen,
  onClose,
}: SmartDocumentIngestionModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [originalAIResults, setOriginalAIResults] = useState<SmartIngestOutput | null>(null); // Store original AI results
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isExpiryDatePickerOpen, setIsExpiryDatePickerOpen] = useState(false);

  // State for AI Confirmation Modal
  const [isAIConfirmModalOpen, setIsAIConfirmModalOpen] = useState(false);
  const [rawAIDataForConfirm, setRawAIDataForConfirm] = useState<AIConfirmationData | null>(null);


  const form = useForm<SmartIngestFormValues>({
    resolver: zodResolver(smartIngestFormSchema),
    defaultValues: {
      vehicleRegistrationNumber: null,
      documentType: 'Insurance',
      customTypeName: null,
      policyNumber: null,
      startDate: null,
      expiryDate: null,
    },
  });

  const watchDocumentType = form.watch("documentType");

  // This useEffect now primarily resets form to blank or initial state when modal opens/closes.
  // Population with AI data is handled by handleAIConfirm.
  useEffect(() => {
    if (isOpen) {
      form.reset({
        vehicleRegistrationNumber: null,
        documentType: 'Insurance',
        customTypeName: null,
        policyNumber: null,
        startDate: null,
        expiryDate: null,
      });
      setSelectedFile(null);
      setOriginalAIResults(null);
      setProcessingError(null);
      setIsProcessingAI(false);
      setIsSubmittingForm(false);
      setRawAIDataForConfirm(null);
      setIsAIConfirmModalOpen(false);
    }
  }, [isOpen, form]);


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setOriginalAIResults(null);
    setRawAIDataForConfirm(null);
    setProcessingError(null);
    // Reset form fields that AI would populate, but keep user chosen type if any
    form.reset({
        ...form.getValues(), // Keep existing values like docType if user set it before file
        vehicleRegistrationNumber: null,
        customTypeName: null,
        policyNumber: null,
        startDate: null,
        expiryDate: null,
    });


    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setProcessingError("File is too large. Maximum size is 10MB.");
        setSelectedFile(null);
        return;
      }
      const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        setProcessingError("Invalid file type. Please upload a PDF, JPG, PNG, or WEBP file.");
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setProcessingError(null);
      await processWithAI(file);
    } else {
      setSelectedFile(null);
    }
  };

  const processWithAI = async (file: File) => {
    if (!file) {
      setProcessingError("No file selected for AI processing.");
      return;
    }
    setIsProcessingAI(true);
    setProcessingError(null);
    setOriginalAIResults(null);
    setRawAIDataForConfirm(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUri = reader.result as string;
        try {
          const result = await smartIngestDocument({ documentDataUri: dataUri });
          setOriginalAIResults(result); // Store the original, raw AI output

          // Prepare data for AIConfirmationModal (this is what's passed to the modal)
          const aiDataForModal: AIConfirmationData = {
            vehicleRegistrationNumber: result.vehicleRegistrationNumber,
            vehicleRegistrationNumberConfidence: result.vehicleRegistrationNumberConfidence,
            documentTypeSuggestion: result.documentTypeSuggestion,
            documentTypeConfidence: result.documentTypeConfidence,
            customTypeNameSuggestion: result.customTypeNameSuggestion,
            policyNumber: result.policyNumber,
            policyNumberConfidence: result.policyNumberConfidence,
            startDate: result.startDate,
            startDateConfidence: result.startDateConfidence,
            expiryDate: result.expiryDate,
            expiryDateConfidence: result.expiryDateConfidence,
          };
          setRawAIDataForConfirm(aiDataForModal);
          setIsAIConfirmModalOpen(true); // Open confirmation modal

        } catch (e) {
          logger.error("Smart Ingest AI error:", e);
          setProcessingError("AI processing failed. You can still enter details manually or try a different file.");
          toast({
            title: "AI Error",
            description: "Could not extract details from the document.",
            variant: "destructive",
          });
        } finally {
          setIsProcessingAI(false);
        }
      };
      reader.onerror = () => {
        setProcessingError("Failed to read file for AI processing.");
        setIsProcessingAI(false);
        toast({ title: "File Read Error", description: "Could not read the file.", variant: "destructive" });
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error("File processing error before AI:", e);
      setProcessingError("Error preparing file for AI. Please try again.");
      setIsProcessingAI(false);
      toast({ title: "File Error", description: "Could not prepare file for AI.", variant: "destructive" });
    }
  };

  const handleAIConfirm = (confirmedData: AIConfirmedValues) => {
    logger.info("Smart Ingest - AI Data Confirmed by User:", confirmedData);

    form.reset({ // Reset with confirmed values
        vehicleRegistrationNumber: confirmedData.vehicleRegistrationNumber ? confirmedData.vehicleRegistrationNumber.toUpperCase() : null,
        documentType: (confirmedData.documentType && DOCUMENT_TYPES.includes(confirmedData.documentType as DocumentType))
            ? confirmedData.documentType as DocumentType
            : 'Other', // Default to Other if type is Unknown or not in our list
        customTypeName: confirmedData.documentType === 'Other' || confirmedData.documentType === 'Unknown'
            ? confirmedData.customTypeName
            : null,
        policyNumber: confirmedData.policyNumber,
        startDate: confirmedData.startDate,
        expiryDate: confirmedData.expiryDate,
    });
    
    if(confirmedData.documentType === 'Unknown' && !confirmedData.customTypeName && originalAIResults?.customTypeNameSuggestion){
        form.setValue('customTypeName', originalAIResults.customTypeNameSuggestion);
    }


    if (confirmedData.userNotes) {
        toast({
            title: "User Notes Captured",
            description: `Notes: "${confirmedData.userNotes}" (These notes are for reference and not saved with the document data yet).`,
            duration: 5000,
        });
    }

    setIsAIConfirmModalOpen(false);
    setRawAIDataForConfirm(null); // Clear data after use
    toast({
        title: "Details Confirmed",
        description: "AI extracted details have been applied. Please review and save.",
    });
  };

  const handleFormSubmit = async (values: SmartIngestFormValues) => {
    if (!selectedFile) {
        toast({ title: "Error", description: "No file selected.", variant: "destructive"});
        return;
    }
    if (!values.vehicleRegistrationNumber) {
        toast({ title: "Error", description: "Vehicle registration number is required.", variant: "destructive"});
        form.setError("vehicleRegistrationNumber", { type: "manual", message: "Vehicle registration number is required."});
        return;
    }
     if (!values.expiryDate) {
        toast({ title: "Error", description: "Expiry date is required.", variant: "destructive"});
        form.setError("expiryDate", { type: "manual", message: "Expiry date is required."});
        return;
    }
    setIsSubmittingForm(true);

    const clientSideDocId = generateClientSideId();
    const mockFileDetails = {
      name: selectedFile.name,
      mockUrl: `/mock-uploads/vehicle_smart_ingest/doc_${clientSideDocId}/${encodeURIComponent(selectedFile.name)}`,
    };
    
    const finalRegNumber = values.vehicleRegistrationNumber.toUpperCase();

    try {
      const result = await processSmartDocumentAndSave(
        finalRegNumber,
        { ...values, vehicleRegistrationNumber: finalRegNumber }, // Pass form values
        mockFileDetails,
        originalAIResults // Pass original AI results for logging/auditing
      );

      if (result.success) {
        toast({
          title: "Document Saved",
          description: `Document successfully added to vehicle ${finalRegNumber}.`,
        });
        router.refresh();
        resetAndClose();
      } else {
        toast({
          title: "Save Failed",
          description: result.error || "Could not save the document.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error submitting smart ingest form:", error);
      toast({
        title: "Submission Error",
        description: "An unexpected error occurred while saving.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const resetAndClose = () => {
    setSelectedFile(null);
    setIsProcessingAI(false);
    setOriginalAIResults(null);
    setRawAIDataForConfirm(null);
    setIsAIConfirmModalOpen(false);
    setProcessingError(null);
    form.reset({ // Reset to initial defaults
        vehicleRegistrationNumber: null,
        documentType: 'Insurance',
        customTypeName: null,
        policyNumber: null,
        startDate: null,
        expiryDate: null,
    });
    onClose();
  };

  const ConfidenceDisplay: React.FC<{ score: number | null | undefined; prefix?: string }> = ({ score, prefix = "AI Conf:" }) => {
    if (score === null || score === undefined) return null;
    return <FormDescription className="text-xs text-blue-600 mt-0.5">{prefix} {(score * 100).toFixed(0)}%</FormDescription>;
  };

  if (!isOpen) return null;

  const displayFormFields = (selectedFile && !isProcessingAI && !isAIConfirmModalOpen) || (originalAIResults && !isProcessingAI && !isAIConfirmModalOpen) ;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isAIConfirmModalOpen) resetAndClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline">Smart Document Upload & Review</DialogTitle>
          <DialogDescription>
            Upload a document. AI will attempt to extract details. Review and correct before saving. Max 10MB. (PDF, JPG, PNG, WEBP). The file itself is not stored.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] p-1">
          <div className="space-y-4 py-2 pr-3">
            <Input
              id="smart-upload-file-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              disabled={isProcessingAI || isSubmittingForm || isAIConfirmModalOpen}
              className="text-sm"
            />
            {processingError && (
              <div className="text-sm text-destructive flex items-center p-2 bg-destructive/10 rounded-md">
                <AlertCircle className="mr-2 h-4 w-4" /> {processingError}
              </div>
            )}
            {selectedFile && !processingError && (
              <div className="text-sm text-muted-foreground">
                Selected: {selectedFile.name} ({(selectedFile.size / (1024*1024)).toFixed(2)} MB)
              </div>
            )}

            {isProcessingAI && (
              <div className="flex items-center justify-center p-4 space-x-2 text-primary bg-primary/10 rounded-md">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>AI is processing your document... Please wait.</span>
              </div>
            )}
            
            {displayFormFields && (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 pt-4 border-t mt-4">
                   <FormField
                    control={form.control}
                    name="vehicleRegistrationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle Registration Number *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., MH12AB1234"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                           />
                        </FormControl>
                        {originalAIResults?.vehicleRegistrationNumberConfidence !== undefined && <ConfidenceDisplay score={originalAIResults.vehicleRegistrationNumberConfidence} />}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="documentType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document Type *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select document type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {DOCUMENT_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {originalAIResults?.documentTypeConfidence !== undefined && <ConfidenceDisplay score={originalAIResults.documentTypeConfidence} />}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchDocumentType === 'Other' && (
                    <FormField
                      control={form.control}
                      name="customTypeName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custom Document Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Road Tax Receipt" {...field} value={field.value ?? ''} />
                          </FormControl>
                           {originalAIResults?.customTypeNameSuggestion && originalAIResults?.documentTypeSuggestion === 'Other' && (
                            <ConfidenceDisplay score={null} prefix={`AI Suggested Name: ${originalAIResults.customTypeNameSuggestion}`}/>
                           )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {(watchDocumentType !== 'Other' && originalAIResults?.customTypeNameSuggestion && originalAIResults?.documentTypeSuggestion && !DOCUMENT_TYPES.includes(originalAIResults.documentTypeSuggestion as DocumentType) ) && (
                    <FormDescription className="text-xs text-blue-600">
                        AI suggested an original type: '{originalAIResults.documentTypeSuggestion}'. Mapped to 'Other'. Original AI suggested custom name: '{originalAIResults.customTypeNameSuggestion}'. Please verify.
                    </FormDescription>
                  )}


                  <FormField
                    control={form.control}
                    name="policyNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Policy / Document Number</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter policy or document number" {...field} value={field.value ?? ''} />
                        </FormControl>
                        {originalAIResults?.policyNumberConfidence !== undefined && <ConfidenceDisplay score={originalAIResults.policyNumberConfidence} />}
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
                                onSelect={(date) => {
                                  field.onChange(date);
                                  setIsStartDatePickerOpen(false);
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          {originalAIResults?.startDateConfidence !== undefined && <ConfidenceDisplay score={originalAIResults.startDateConfidence} />}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="expiryDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Expiry Date *</FormLabel>
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
                                onSelect={(date) => {
                                  field.onChange(date);
                                  setIsExpiryDatePickerOpen(false);
                                }}
                                initialFocus
                               />
                            </PopoverContent>
                          </Popover>
                          {originalAIResults?.expiryDateConfidence !== undefined && <ConfidenceDisplay score={originalAIResults.expiryDateConfidence} />}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                   <FormDescription className="text-xs italic">
                     Fields marked with * are required. Please review AI suggestions and correct if necessary before saving. Registration number will be auto-uppercased.
                   </FormDescription>
                  <DialogFooter className="sm:justify-between pt-4">
                    <DialogClose asChild>
                       <Button type="button" variant="outline" onClick={resetAndClose} disabled={isProcessingAI || isSubmittingForm}>
                         Cancel
                       </Button>
                    </DialogClose>
                    <Button
                      type="submit"
                      disabled={!selectedFile || isProcessingAI || isSubmittingForm || !form.formState.isValid}
                    >
                      {(isProcessingAI || isSubmittingForm) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" /> }
                      {isSubmittingForm ? "Saving..." : "Confirm & Save Document"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            )}
          </div>
        </ScrollArea>

        {(!selectedFile && !isProcessingAI && !originalAIResults && !isAIConfirmModalOpen) && (
             <DialogFooter className="sm:justify-end pt-4">
                 <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={resetAndClose}>
                        Cancel
                    </Button>
                 </DialogClose>
                 <Button type="button" disabled>Select a file to start</Button>
            </DialogFooter>
        )}
      </DialogContent>
    </Dialog>

    {rawAIDataForConfirm && (
        <AIConfirmationModal
            isOpen={isAIConfirmModalOpen}
            onClose={() => {
                setIsAIConfirmModalOpen(false);
                setRawAIDataForConfirm(null);
                 // If user cancels confirmation, keep original AI suggestions in main form (if any)
                if (originalAIResults) {
                    form.reset({
                        vehicleRegistrationNumber: originalAIResults.vehicleRegistrationNumber ? originalAIResults.vehicleRegistrationNumber.toUpperCase() : null,
                        documentType: originalAIResults.documentTypeSuggestion && DOCUMENT_TYPES.includes(originalAIResults.documentTypeSuggestion as DocumentType)
                        ? originalAIResults.documentTypeSuggestion as DocumentType
                        : 'Other',
                        customTypeName: (originalAIResults.documentTypeSuggestion === 'Other' || originalAIResults.documentTypeSuggestion === 'Unknown')
                        ? originalAIResults.customTypeNameSuggestion
                        : (originalAIResults.documentTypeSuggestion && !DOCUMENT_TYPES.includes(originalAIResults.documentTypeSuggestion as DocumentType) ? originalAIResults.documentTypeSuggestion : null),
                        policyNumber: originalAIResults.policyNumber,
                        startDate: originalAIResults.startDate && isValid(parseISO(originalAIResults.startDate)) ? parseISO(originalAIResults.startDate) : null,
                        expiryDate: originalAIResults.expiryDate && isValid(parseISO(originalAIResults.expiryDate)) ? parseISO(originalAIResults.expiryDate) : null,
                    });
                }
            }}
            aiData={rawAIDataForConfirm}
            onConfirm={handleAIConfirm}
            isLoading={isProcessingAI}
            showVehicleRegistration={true}
            showDocumentType={true}
        />
    )}
    </>
  );
}

