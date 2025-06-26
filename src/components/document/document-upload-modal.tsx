
"use client";

import React, { useState, useEffect, useCallback } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, FileText, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, isValid } from 'date-fns';
import { DOCUMENT_TYPES, AI_SUPPORTED_DOCUMENT_TYPES, DATE_FORMAT } from '@/lib/constants';
import type { DocumentType, VehicleDocument } from '@/lib/types';
import type { ExtractExpiryDateInput, ExtractExpiryDateOutput } from '@/ai/flows/extract-expiry-date';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle as InfoCardTitle, CardContent } from '@/components/ui/card'; // Renamed CardTitle
import { AIConfirmationModal, type AIConfirmationData, type AIConfirmedValues } from './ai-confirmation-modal';
import { logger } from '@/lib/logger';

import { smartIngestDocument, type SmartIngestOutput } from '@/ai/flows/smart-ingest-flow';
const generateClientSideId = () => Math.random().toString(36).substr(2, 9);

const formSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES as [string, ...string[]]),
  customTypeName: z.string().trim().optional(),
  policyNumber: z.string().trim().max(50, "Policy number too long").nullable(), // Changed to .nullable()
  startDate: z.date().nullable(),
  expiryDate: z.date().nullable(),
  documentFile: z.instanceof(File).optional().nullable(),
 extractedRegistrationNumber: z.string().optional().nullable(),
  extractedMake: z.string().optional().nullable(),
  extractedModel: z.string().optional().nullable(),
  extractedVehicleType: z.string().optional().nullable(),
}).refine((data) => {
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

type FormValues = z.infer<typeof formSchema>;

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    data: {
      documentType: DocumentType;
      customTypeName?: string;
      policyNumber?: string | null;
      startDate?: string | null; // ISO string
      expiryDate: string | null; // ISO string
      documentName?: string; // Filename
      documentUrl?: string; // Mock URL
    },
    aiExtractedPolicyNumber?: string | null,
    aiPolicyNumberConfidence?: number | null,
    aiExtractedStartDate?: string | null,
    aiStartDateConfidence?: number | null,
    aiExtractedExpiryDate?: string | null,
 aiExpiryDateConfidence?: number | null,
    aiExtractedRegistrationNumber?: string | null,
 aiRegistrationNumberConfidence?: number | null,
    aiExtractedMake?: string | null,
    aiExtractedModel?: string | null,
  ) => Promise<void>;
  vehicleId: string;
  initialDocumentData?: Partial<Omit<VehicleDocument, 'id' | 'vehicleId' | 'status' | 'uploadedAt' | 'aiExtractedDate' | 'aiConfidence'>> & { type: DocumentType, customTypeName?: string, policyNumber?: string | null } | null;
  extractExpiryDateFn: (input: ExtractExpiryDateInput) => Promise<ExtractExpiryDateOutput>;
}

export function DocumentUploadModal({
  isOpen,
  onClose,
  onSubmit,
  vehicleId,
  initialDocumentData,
  extractExpiryDateFn,
}: DocumentUploadModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtractingDate, setIsExtractingDate] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // State for original AI extracted data (passed to onSubmit)
  const [originalAIExtractedPolicyNumber, setOriginalAIExtractedPolicyNumber] = useState<string | null>(null);
  const [originalAIPolicyNumberConfidence, setOriginalAIPolicyNumberConfidence] = useState<number | null>(null);
  const [originalAIExtractedStartDate, setOriginalAIExtractedStartDate] = useState<string | null>(null);
  const [originalAIStartDateConfidence, setOriginalAIStartDateConfidence] = useState<number | null>(null);
  const [originalAIExtractedExpiryDate, setOriginalAIExtractedExpiryDate] = useState<string | null>(null);
  const [originalAIExpiryDateConfidence, setOriginalAIExpiryDateConfidence] = useState<number | null>(null);

  // State for AI extracted vehicle details (from smartIngestDocument)
  const [originalAIExtractedRegistrationNumber, setOriginalAIExtractedRegistrationNumber] = useState<string | null>(null);
  const [originalAIRegistrationNumberConfidence, setOriginalAIRegistrationNumberConfidence] = useState<number | null>(null);
  const [originalAIExtractedMake, setOriginalAIExtractedMake] = useState<string | null>(null);
  const [originalAIExtractedModel, setOriginalAIExtractedModel] = useState<string | null>(null);
  const [originalAIExtractedVehicleType, setOriginalAIExtractedVehicleType] = useState<string | null>(null);
  
  const [aiError, setAiError] = useState<string | null>(null);
  const { toast } = useToast();

  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isExpiryDatePickerOpen, setIsExpiryDatePickerOpen] = useState(false);

  // State for AI Confirmation Modal
  const [isAIConfirmModalOpen, setIsAIConfirmModalOpen] = useState(false);
  const [rawAIDataForConfirm, setRawAIDataForConfirm] = useState<AIConfirmationData | null>(null);

  const modalTitle = "Upload New Document Version";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      documentType: initialDocumentData?.type || 'Insurance',
      customTypeName: initialDocumentData?.customTypeName || '',
      policyNumber: initialDocumentData?.policyNumber || '',
      startDate: null,
      expiryDate: null,
      documentFile: null,
      extractedRegistrationNumber: null,
      extractedMake: null,
      extractedModel: null,
      extractedVehicleType: null,
    },
  });

  const resetAIStates = () => {
    setOriginalAIExtractedPolicyNumber(null);
    setOriginalAIPolicyNumberConfidence(null);
    setOriginalAIExtractedStartDate(null);
    setOriginalAIStartDateConfidence(null);
    setOriginalAIExtractedExpiryDate(null);
    setOriginalAIExpiryDateConfidence(null);
    setOriginalAIRegistrationNumberConfidence(null);
    setOriginalAIExtractedMake(null);
    setOriginalAIExtractedModel(null);
    setOriginalAIExpiryDateConfidence(null);
    setAiError(null);
    setRawAIDataForConfirm(null);
  };

  useEffect(() => {
    form.reset({
      documentType: initialDocumentData?.type || 'Insurance',
      customTypeName: initialDocumentData?.customTypeName || '',
      policyNumber: initialDocumentData?.policyNumber || '', // Pre-fill policy number
      startDate: null, // Start and expiry usually new for renewals
      expiryDate: null,
      documentFile: null,
      extractedRegistrationNumber: null,
      extractedMake: null,
      extractedModel: null,
      extractedVehicleType: null,
    });
    resetAIStates();
    setSelectedFile(null);
    setFilePreview(null);
  }, [initialDocumentData, form, isOpen]);


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      form.setValue('documentFile', file);
      resetAIStates(); // Reset previous AI data on new file selection

      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUri = reader.result as string;
        const currentDocType = form.getValues('documentType');

        if (AI_SUPPORTED_DOCUMENT_TYPES.includes(currentDocType)) {
          setIsExtractingDate(true);

          let result: ExtractExpiryDateOutput | SmartIngestOutput | null = null;

          try {
            if (currentDocType === 'RegistrationCard') {
               result = await smartIngestDocument({ documentDataUri: dataUri });

               // Store original AI results for Registration Card
                // smartIngestDocument provides different outputs, need to map accordingly
               const smartIngestResult = result as SmartIngestOutput; // Cast for type safety
               setOriginalAIExtractedPolicyNumber(smartIngestResult.vehicleRegistrationNumber); // Map vehicleRegistrationNumber to policyNumber for now
               setOriginalAIPolicyNumberConfidence(smartIngestResult.vehicleRegistrationNumberConfidence);
               setOriginalAIExtractedStartDate(smartIngestResult.registrationDate ?? null); // Map registrationDate to startDate, keep as string or null
               setOriginalAIStartDateConfidence(smartIngestResult.registrationDateConfidence); // Keep original confidence
               // smartIngestDocument doesn't directly provide expiry date for reg cards, if needed, would require further AI
               setOriginalAIExtractedExpiryDate(null); 
               setOriginalAIExpiryDateConfidence(null);
               setOriginalAIExtractedRegistrationNumber(smartIngestResult.vehicleRegistrationNumber);
               setOriginalAIRegistrationNumberConfidence(smartIngestResult.vehicleRegistrationNumberConfidence);
               setOriginalAIExtractedMake(smartIngestResult.vehicleMakeSuggestion);
               setOriginalAIExtractedModel(smartIngestResult.vehicleModelSuggestion);
               setOriginalAIExtractedVehicleType(smartIngestResult.vehicleTypeSuggestion);

                // Prepare data for AIConfirmationModal - need to update modal to handle SmartIngestOutput
               const aiDataForModal: AIConfirmationData = { // Ensure this structure matches AIConfirmationData
                    policyNumber: smartIngestResult.vehicleRegistrationNumber, // Map vehicleRegistrationNumber to policyNumber
                    policyNumberConfidence: smartIngestResult.vehicleRegistrationNumberConfidence,
                    startDate: smartIngestResult.registrationDate, // Map registrationDate to startDate
                    startDateConfidence: smartIngestResult.registrationDateConfidence,
                    expiryDate: null, // No expiry date from smartIngest for reg cards
                    expiryDateConfidence: null,
                    // Include vehicle details from smartIngest for confirmation
                    vehicleRegistrationNumber: smartIngestResult.vehicleRegistrationNumber, // Corrected mapping
                    vehicleRegistrationNumberConfidence: smartIngestResult.registrationNumberConfidence,
                    documentTypeSuggestion: smartIngestResult.documentTypeSuggestion,
                    documentTypeConfidence: smartIngestResult.documentTypeConfidence, // Corrected property name
                    customTypeNameSuggestion: smartIngestResult.customTypeNameSuggestion, // Corrected property name
                    extractedMake: smartIngestResult.vehicleMakeSuggestion, // Corrected property name
                    extractedModel: smartIngestResult.vehicleModelSuggestion, // Corrected property name
                    extractedVehicleType: smartIngestResult.vehicleTypeSuggestion, // Corrected mapping
                };
 setRawAIDataForConfirm(aiDataForModal);
                setIsAIConfirmModalOpen(true); // Open confirmation modal

            } else { // Existing logic for Insurance, Fitness, PUC
               result = await extractExpiryDateFn({
                 documentDataUri: dataUri,
                 documentType: currentDocType.toLowerCase() as 'insurance' | 'fitness' | 'puc',
               });

               const extractExpiryDateResult = result as ExtractExpiryDateOutput; // Cast

               // Store original AI results
               setOriginalAIExtractedPolicyNumber(extractExpiryDateResult.policyNumber);
               setOriginalAIPolicyNumberConfidence(extractExpiryDateResult.policyNumberConfidence); // Keep existing confidence
               setOriginalAIExtractedStartDate(extractExpiryDateResult.startDate ?? null); // Keep as string or null
               setOriginalAIStartDateConfidence(extractExpiryDateResult.startDateConfidence);
               setOriginalAIExtractedExpiryDate(extractExpiryDateResult.expiryDate);
               setOriginalAIExpiryDateConfidence(extractExpiryDateResult.confidence);

               // Prepare data for AIConfirmationModal (existing structure)
               const aiDataForModal: AIConfirmationData = {
                 policyNumber: extractExpiryDateResult.policyNumber,
                 policyNumberConfidence: extractExpiryDateResult.policyNumberConfidence,
                 startDate: extractExpiryDateResult.startDate,
                 startDateConfidence: extractExpiryDateResult.startDateConfidence,
                 expiryDate: extractExpiryDateResult.expiryDate,
                 expiryDateConfidence: extractExpiryDateResult.confidence,
                 vehicleRegistrationNumber: undefined,
                 extractedMake: undefined, // Explicitly set to undefined for non-reg cards
                 extractedModel: undefined,
                 extractedVehicleType: undefined,
                 vehicleRegistrationNumberConfidence: undefined,
                 documentTypeSuggestion: extractExpiryDateResult.documentTypeSuggestion, // extractExpiryDate *can* suggest type
                 documentTypeConfidence: undefined,
                 customTypeNameSuggestion: undefined,
               };
               setRawAIDataForConfirm(aiDataForModal);
               setIsAIConfirmModalOpen(true); // Open confirmation modal
            }

          } catch (e) {
            logger.error("AI extraction error in DocumentUploadModal:", e);
            setAiError("Failed to extract details using AI. Please enter manually.");
            toast({ title: "AI Error", description: "AI data extraction failed.", variant: "destructive" });
          } finally {
            setIsExtractingDate(false);
          }
        }
      };
      reader.onerror = () => {
         setAiError("Failed to read file for AI extraction.");
         setIsExtractingDate(false);
         toast({ title: "File Read Error", description: "Could not read the file for AI processing.", variant: "destructive" });
      };
      reader.readAsDataURL(file);
    } else {
      setSelectedFile(null);
      setFilePreview(null);
      form.setValue('documentFile', null);
      resetAIStates();
    }
  };

  const handleAIConfirm = (confirmedData: AIConfirmedValues) => {
    logger.info("AI Data Confirmed by User in DocumentUploadModal:", confirmedData);
    // Set form values with confirmed data, even if it's null (user might clear a field)
    form.setValue('policyNumber', confirmedData.policyNumber); // Policy # might map from reg #
    // Only set dates if they are valid ISO strings
    if (confirmedData.startDate && isValid(parseISO(confirmedData.startDate))) {
        form.setValue('startDate', parseISO(confirmedData.startDate));
    }
    if (confirmedData.expiryDate && isValid(parseISO(confirmedData.expiryDate))) {
        form.setValue('expiryDate', parseISO(confirmedData.expiryDate));
    }

    // Need to handle setting form values for extracted vehicle details here
    // Set form values for extracted vehicle details if they exist in confirmed data
    form.setValue('extractedRegistrationNumber', confirmedData.vehicleRegistrationNumber ?? null);
    form.setValue('extractedMake', confirmedData.extractedMake ?? null);
    form.setValue('extractedModel', confirmedData.extractedModel ?? null);
    form.setValue('extractedVehicleType', confirmedData.extractedVehicleType ?? null);

    // Also, update the original AI states with the *confirmed* values for submission
    // This is important if the user changes values in the confirmation modal
    setOriginalAIExtractedPolicyNumber(confirmedData.policyNumber);
    setOriginalAIExtractedStartDate(confirmedData.startDate); // Keep as string or null
    setOriginalAIExtractedExpiryDate(confirmedData.expiryDate); // Keep as string or null
    setOriginalAIExtractedRegistrationNumber(confirmedData.vehicleRegistrationNumber);
    setOriginalAIExtractedMake(confirmedData.extractedMake ?? null);
    setOriginalAIExtractedModel(confirmedData.extractedModel ?? null);
    setOriginalAIExtractedVehicleType(confirmedData.extractedVehicleType ?? null);

    // Show toast for user notes if any
    if (confirmedData.userNotes) {
            try {
        toast({
            title: "User Notes Captured",
            description: `Notes: "${confirmedData.userNotes}" (These notes are for reference and not saved with the document data yet).`,
            duration: 5000,
        });
    }
 catch (error) {
 logger.error("Error showing user notes toast:", error);
 }

    setIsAIConfirmModalOpen(false);
    setRawAIDataForConfirm(null); // Clear data after use
  };

  const currentDocumentType = form.watch('documentType');

  const processSubmit = async (values: FormValues) => {
    if (!selectedFile) {
        toast({ title: "File Required", description: "Please select a document file.", variant: "destructive"});
        return;
    }
    if (!values.expiryDate) {
        toast({ title: "Expiry Date Required", description: "Please set an expiry date for the document.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true);
    // TODO: Replace mock URL logic with actual file upload logic
    const clientSideDocId = generateClientSideId();
    const mockDocumentUrl = `/mock-uploads/vehicle_${vehicleId}/doc_${clientSideDocId}/${encodeURIComponent(selectedFile.name)}`;

    await onSubmit(
            {
                documentType: values.documentType,
                customTypeName: values.customTypeName,
                policyNumber: values.policyNumber,
                startDate: values.startDate ? format(values.startDate, 'yyyy-MM-dd') : null,
                expiryDate: values.expiryDate ? format(values.expiryDate, 'yyyy-MM-dd') : null,
                documentName: selectedFile.name,
                documentUrl: mockDocumentUrl,
            },
            // Pass AI extracted data - only include if AI extraction happened
            originalAIExtractedPolicyNumber,
            originalAIPolicyNumberConfidence,
            originalAIExtractedStartDate, // Pass the string/null
            originalAIStartDateConfidence,
            originalAIExtractedExpiryDate,
            originalAIExpiryDateConfidence,
            // Include vehicle details for Registration Card
            originalAIExtractedRegistrationNumber,
            originalAIRegistrationNumberConfidence,
            originalAIExtractedMake,
            originalAIExtractedModel,
            // Note: AIConfirmationData also has extractedVehicleType, but it's not directly saved with the document in the current data structure
            // If needed, we might need to update the Document type and add this field.
    );
    setIsSubmitting(false);
    // onClose(); // Let parent decide if modal should close (usually it does after onSubmit)
  };

  if (!isOpen) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isAIConfirmModalOpen) onClose(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline">
              {modalTitle}
            </DialogTitle>
            <DialogDescription>
              Upload a new version or instance of this document. It will be added to the vehicle's history. The file itself is not stored, only its metadata.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(processSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="documentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document Type *</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        resetAIStates(); // Reset AI if type changes after file selection
                        // If a file is already selected, and new type supports AI, re-trigger? For now, user must re-select file if type changes.
                        if (selectedFile) {
                            toast({title: "Info", description: "Document type changed. Please re-select the file if you want AI to process it for the new type."})
                            // To auto-retrigger AI, one might call a modified handleFileChange here, but simpler to ask user.
                        }
                      }}
                      defaultValue={field.value}
                      value={field.value} // Ensure value is controlled
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {currentDocumentType === 'Other' && (
                <FormField
                  control={form.control}
                  name="customTypeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Document Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Special Permit XYZ" {...field} value={field.value ?? ''}/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="documentFile"
                render={({ field }) => ( // field is not directly used for input value, but for registration
                  <FormItem>
                    <FormLabel>Document File *</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileChange} // Custom handler
                        className="text-sm"
                        required // Basic HTML5 required
                        disabled={isExtractingDate || isSubmitting}
                      />
                    </FormControl>
                    <FormMessage /> {/* For zod errors related to 'documentFile' if any */}
                  </FormItem>
                )}
              />

              {filePreview && selectedFile && selectedFile.type.startsWith('image/') && (
                <img src={filePreview} alt="File preview" className="mt-2 max-h-40 rounded-md border" />
              )}
              {selectedFile && !selectedFile.type.startsWith('image/') && (
                  <div className="text-sm text-muted-foreground mt-1">
                      Selected file: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB) - Preview not available.
                  </div>
              )}

              {isExtractingDate && (
                <div className="flex items-center space-x-2 text-sm text-primary p-2 bg-primary/10 rounded-md">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Extracting document details using AI...</span>
                </div>
              )}
              {aiError && !isExtractingDate && ( // Show AI error only if not currently extracting
                <div className="flex items-center space-x-2 text-sm text-destructive p-2 bg-destructive/10 rounded-md">
                  <AlertCircle className="h-4 w-4" />
                  <span>{aiError}</span>
                </div>
              )}
              
              {/* Display initial AI suggestions before confirmation modal for context, if modal isn't open */}
              {!isAIConfirmModalOpen && !isExtractingDate && (originalAIExtractedPolicyNumber || originalAIExtractedStartDate || originalAIExtractedExpiryDate) && (
                  <Card className="p-3 bg-muted/50">
                      <InfoCardTitle className="text-sm font-medium flex items-center"><Info className="w-4 h-4 mr-2 text-blue-500"/>AI Initial Scan:</InfoCardTitle>
                      <CardContent className="text-xs space-y-1 p-0 pt-1">
                          {originalAIExtractedPolicyNumber && (<div>Policy #: {originalAIExtractedPolicyNumber} (Conf: {originalAIPolicyNumberConfidence?.toFixed(2) ?? 'N/A'})</div>)}
                          {originalAIExtractedStartDate && isValid(parseISO(originalAIExtractedStartDate)) && (<div>Start: {format(parseISO(originalAIExtractedStartDate), DATE_FORMAT)} (Conf: {originalAIStartDateConfidence?.toFixed(2) ?? 'N/A'})</div>)}
                          {originalAIExtractedExpiryDate && isValid(parseISO(originalAIExtractedExpiryDate)) && (<div>Expiry: {format(parseISO(originalAIExtractedExpiryDate), DATE_FORMAT)} (Conf: {originalAIExpiryDateConfidence?.toFixed(2) ?? 'N/A'})</div>)}
                          <FormDescription className="pt-1">Please verify and adjust details below, or via the confirmation step if AI processed the file.</FormDescription>
                      </CardContent>
                  </Card>
              )}


              <FormField
                control={form.control}
                name="policyNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Policy / Document Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter policy or document number" {...field} value={field.value ?? ''} disabled={isExtractingDate || isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
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
                                disabled={isExtractingDate || isSubmitting}
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
                              disabled={isExtractingDate || isSubmitting}
                            />
                          </PopoverContent>
                        </Popover>
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
                                disabled={isExtractingDate || isSubmitting}
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
                              disabled={isExtractingDate || isSubmitting}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
              </div>
              <FormDescription className="text-xs">
                  {AI_SUPPORTED_DOCUMENT_TYPES.includes(form.getValues('documentType')) ?
                  'If AI processes the file, a confirmation step will appear. Otherwise, please enter/verify details manually.' :
                  'Please enter details manually.'} Fields marked with * are required.
              </FormDescription>


              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting || isExtractingDate}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || isExtractingDate || !selectedFile || !form.getValues('expiryDate') }>
                  {(isSubmitting || isExtractingDate) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add to History
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {rawAIDataForConfirm && (
        <AIConfirmationModal
          isOpen={isAIConfirmModalOpen}
          onClose={() => {
            setIsAIConfirmModalOpen(false);
            setRawAIDataForConfirm(null); // Clear data if modal is closed without confirming
          }}
          aiData={rawAIDataForConfirm}
          onConfirm={handleAIConfirm}
          isLoading={isExtractingDate} // Or false, as extraction is done by now
          // Pass props to control what AI data is shown/editable in the confirmation modal
          showPolicyNumber={AI_SUPPORTED_DOCUMENT_TYPES.includes(currentDocumentType)}
          showDates={AI_SUPPORTED_DOCUMENT_TYPES.includes(currentDocumentType)}
          showVehicleRegistration={currentDocumentType === 'RegistrationCard'}
          showMakeModel={currentDocumentType === 'RegistrationCard'}
          showVehicleType={currentDocumentType === 'RegistrationCard'}
          showDocumentType={false} // Keep false for now, as type is selected in main modal
          showCustomTypeName={false} // Keep false for now, as custom name is handled in main modal
        />
      )}
    </>
  );
}
