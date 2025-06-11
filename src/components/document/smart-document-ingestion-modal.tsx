
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

const suggestableDocumentTypesEnum = DOCUMENT_TYPES.filter(type => type !== 'Other'); // For the schema, AI might suggest 'Other'

const smartIngestFormSchema = z.object({
  vehicleRegistrationNumber: z.string().min(1, "Vehicle registration is required.").max(20, "Registration number too long.").optional().nullable(),
  documentType: z.enum(DOCUMENT_TYPES as [string, ...string[]], {
    required_error: "Document type is required.",
  }),
  customTypeName: z.string().max(50, "Custom type name too long.").optional().nullable(),
  policyNumber: z.string().max(50, "Policy number too long.").optional().nullable(),
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

type SmartIngestFormValues = z.infer<typeof smartIngestFormSchema>;

interface SmartDocumentIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  // onProcess: (file: File, aiData: SmartIngestOutput, formData: SmartIngestFormValues) => Promise<void>; 
}

export function SmartDocumentIngestionModal({
  isOpen,
  onClose,
  // onProcess,
}: SmartDocumentIngestionModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiResults, setAiResults] = useState<SmartIngestOutput | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const { toast } = useToast();

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

  useEffect(() => {
    if (aiResults) {
      form.reset({
        vehicleRegistrationNumber: aiResults.vehicleRegistrationNumber,
        documentType: aiResults.documentTypeSuggestion && DOCUMENT_TYPES.includes(aiResults.documentTypeSuggestion as DocumentType)
          ? aiResults.documentTypeSuggestion as DocumentType
          : 'Other', // Default to 'Other' if suggestion is not in our strict list or is 'Unknown'
        customTypeName: (aiResults.documentTypeSuggestion === 'Other' || aiResults.documentTypeSuggestion === 'Unknown') 
          ? aiResults.customTypeNameSuggestion 
          : (aiResults.documentTypeSuggestion && !DOCUMENT_TYPES.includes(aiResults.documentTypeSuggestion as DocumentType) ? aiResults.documentTypeSuggestion : null), // if AI suggests a type not in enum, treat as custom for 'Other'
        policyNumber: aiResults.policyNumber,
        startDate: aiResults.startDate && isValid(parseISO(aiResults.startDate)) ? parseISO(aiResults.startDate) : null,
        expiryDate: aiResults.expiryDate && isValid(parseISO(aiResults.expiryDate)) ? parseISO(aiResults.expiryDate) : null,
      });
    }
  }, [aiResults, form]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setAiResults(null);
    setProcessingError(null);
    form.reset(); // Reset form when new file is selected

    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setProcessingError("File is too large. Maximum size is 5MB.");
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
    setAiResults(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUri = reader.result as string;
        try {
          const result = await smartIngestDocument({ documentDataUri: dataUri });
          setAiResults(result);
          toast({
            title: "AI Processing Complete",
            description: "Review the extracted details below.",
          });
        } catch (e) {
          console.error("Smart Ingest AI error:", e);
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

  const handleFormSubmit = async (values: SmartIngestFormValues) => {
    if (!selectedFile) {
        toast({ title: "Error", description: "No file selected.", variant: "destructive"});
        return;
    }
    setIsSubmittingForm(true);
    console.log("Form Data to be saved (Step F target):", values);
    console.log("Selected File for upload:", selectedFile.name);
    console.log("Original AI Results for reference:", aiResults);
    
    // Placeholder for Step F: Call server action to save data
    // await onProcess(selectedFile, aiResults!, values); 
    
    toast({ title: "Data Logged (Dev)", description: "Form data logged to console. Save logic in next step."});
    // resetAndClose(); // Or keep open for further steps
    setIsSubmittingForm(false);
  };

  const resetAndClose = () => {
    setSelectedFile(null);
    setIsProcessingAI(false);
    setAiResults(null);
    setProcessingError(null);
    form.reset();
    onClose();
  };

  const ConfidenceDisplay: React.FC<{ score: number | null | undefined }> = ({ score }) => {
    if (score === null || score === undefined) return null;
    return <FormDescription className="text-xs text-blue-600">AI Confidence: {(score * 100).toFixed(0)}%</FormDescription>;
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetAndClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline">Smart Document Upload & Review</DialogTitle>
          <DialogDescription>
            Upload a document. AI will attempt to extract details. Review and correct before saving.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] p-1">
          <div className="space-y-4 py-2 pr-3">
            <Input
              id="smart-upload-file-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              disabled={isProcessingAI || isSubmittingForm}
            />
            {processingError && (
              <div className="text-sm text-destructive flex items-center">
                <AlertCircle className="mr-2 h-4 w-4" /> {processingError}
              </div>
            )}
            {selectedFile && !processingError && (
              <div className="text-sm text-muted-foreground">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
              </div>
            )}

            {isProcessingAI && (
              <div className="flex items-center justify-center p-4 space-x-2 text-primary bg-primary/10 rounded-md">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>AI is processing your document... Please wait.</span>
              </div>
            )}

            {(aiResults || selectedFile) && !isProcessingAI && ( // Show form if AI results exist OR if a file is selected (even if AI failed, allow manual entry)
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 pt-4 border-t mt-4">
                   <FormField
                    control={form.control}
                    name="vehicleRegistrationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle Registration Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., MH12AB1234" {...field} value={field.value ?? ''} />
                        </FormControl>
                        {aiResults?.vehicleRegistrationNumberConfidence !== undefined && <ConfidenceDisplay score={aiResults.vehicleRegistrationNumberConfidence} />}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="documentType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document Type</FormLabel>
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
                        {aiResults?.documentTypeConfidence !== undefined && <ConfidenceDisplay score={aiResults.documentTypeConfidence} />}
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
                          <FormLabel>Custom Document Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Road Tax Receipt" {...field} value={field.value ?? ''} />
                          </FormControl>
                           {/* No specific confidence for custom name, it's part of doc type suggestion */}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  
                  {(watchDocumentType !== 'Other' && aiResults?.customTypeNameSuggestion && aiResults?.documentTypeSuggestion && !DOCUMENT_TYPES.includes(aiResults.documentTypeSuggestion as DocumentType) ) && (
                    <FormDescription className="text-xs text-blue-600">
                        AI suggested an original type: '{aiResults.documentTypeSuggestion}'. It has been mapped to 'Other'. Consider using '{aiResults.customTypeNameSuggestion}' as Custom Name.
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
                        {aiResults?.policyNumberConfidence !== undefined && <ConfidenceDisplay score={aiResults.policyNumberConfidence} />}
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
                          <Popover>
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
                              <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                            </PopoverContent>
                          </Popover>
                          {aiResults?.startDateConfidence !== undefined && <ConfidenceDisplay score={aiResults.startDateConfidence} />}
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
                          <Popover>
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
                              <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                            </PopoverContent>
                          </Popover>
                          {aiResults?.expiryDateConfidence !== undefined && <ConfidenceDisplay score={aiResults.expiryDateConfidence} />}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
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
        
        { /* Fallback for when no file is selected or AI hasn't processed, but modal is open */ }
        {(!selectedFile && !isProcessingAI && !aiResults) && (
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
  );
}

    