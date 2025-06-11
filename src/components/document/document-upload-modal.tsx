

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
import { CalendarIcon, Loader2, FileText, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, isValid } from 'date-fns';
import { DOCUMENT_TYPES, AI_SUPPORTED_DOCUMENT_TYPES, DATE_FORMAT } from '@/lib/constants';
import type { DocumentType, VehicleDocument } from '@/lib/types';
import type { ExtractExpiryDateInput, ExtractExpiryDateOutput } from '@/ai/flows/extract-expiry-date';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES as [string, ...string[]]),
  customTypeName: z.string().optional(),
  expiryDate: z.date().nullable(), // Nullable if AI is to extract or not applicable
  documentFile: z.instanceof(File).optional().nullable(),
}).refine(data => {
  if (data.documentType === 'Other') {
    return !!data.customTypeName && data.customTypeName.trim().length > 0;
  }
  return true;
}, {
  message: "Custom type name is required for 'Other' document type.",
  path: ["customTypeName"],
});

type FormValues = z.infer<typeof formSchema>;

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    data: {
      documentType: DocumentType;
      customTypeName?: string;
      expiryDate: string | null; // ISO string
      documentFile?: File;
    },
    aiExtractedDate?: string | null,
    aiConfidence?: number | null
  ) => Promise<void>;
  vehicleId: string;
  initialDocumentData?: Partial<VehicleDocument> | { type: DocumentType, customTypeName?: string } | null; // Can be a partial doc for context or just type info
  extractExpiryDateFn: (input: ExtractExpiryDateInput) => Promise<ExtractExpiryDateOutput>;
}

export function DocumentUploadModal({
  isOpen,
  onClose,
  onSubmit,
  vehicleId,
  initialDocumentData, // This might just provide type context for a new historical entry
  extractExpiryDateFn,
}: DocumentUploadModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtractingDate, setIsExtractingDate] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null); // For new file
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [aiExtractedDate, setAiExtractedDate] = useState<string | null>(null);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const { toast } = useToast();

  // If initialDocumentData has an ID, it's a specific historical doc (though we add new).
  // If it only has 'type', it's context for adding a new historical entry of that type.
  const isEditingHistoricalEntry = !!(initialDocumentData && 'id' in initialDocumentData);
  const modalTitle = "Upload New Document Version"; // Always adding new for history

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      documentType: initialDocumentData?.type || 'Insurance',
      customTypeName: initialDocumentData?.customTypeName || '',
      expiryDate: null, // Always null for new historical entry initially
      documentFile: null,
    },
  });

  useEffect(() => {
    // Reset form for new historical entry, but pre-fill type if provided
    form.reset({
      documentType: initialDocumentData?.type || 'Insurance',
      customTypeName: initialDocumentData?.customTypeName || '',
      expiryDate: null, // New historical entry, expiry set by user/AI
      documentFile: null,
    });
    setAiExtractedDate(null);
    setAiConfidence(null);
    setSelectedFile(null);
    setFilePreview(null); // No preview for new historical entry
    setAiError(null);
  }, [initialDocumentData, form, isOpen]);


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file)); 
      form.setValue('documentFile', file);
      setAiError(null);
      setAiExtractedDate(null); // Reset AI fields on new file
      setAiConfidence(null);
      
      const currentDocType = form.getValues('documentType');
      if (AI_SUPPORTED_DOCUMENT_TYPES.includes(currentDocType)) {
        setIsExtractingDate(true);
        try {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const dataUri = reader.result as string;
            try {
              const result = await extractExpiryDateFn({
                documentDataUri: dataUri,
                documentType: currentDocType.toLowerCase() as 'insurance' | 'fitness' | 'puc',
              });
              setAiExtractedDate(result.expiryDate);
              setAiConfidence(result.confidence);
              if (result.expiryDate && isValid(parseISO(result.expiryDate))) {
                form.setValue('expiryDate', parseISO(result.expiryDate));
                toast({ title: "AI Extraction", description: `Suggested expiry date: ${format(parseISO(result.expiryDate), DATE_FORMAT)} (Confidence: ${result.confidence?.toFixed(2)})` });
              } else if (result.expiryDate === null) {
                 toast({ title: "AI Extraction", description: "AI could not find an expiry date.", variant: "default" });
              }
            } catch (e) {
              console.error("AI extraction error:", e);
              setAiError("Failed to extract date using AI. Please enter manually.");
              toast({ title: "AI Error", description: "AI date extraction failed.", variant: "destructive" });
            } finally {
              setIsExtractingDate(false);
            }
          };
          reader.onerror = () => {
             setAiError("Failed to read file for AI extraction.");
             setIsExtractingDate(false);
             toast({ title: "File Read Error", description: "Could not read the file for AI processing.", variant: "destructive" });
          };
          reader.readAsDataURL(file);
        } catch (e) {
          console.error("File processing error:", e);
          setAiError("Error processing file.");
          setIsExtractingDate(false);
          toast({ title: "File Error", description: "Error processing file before AI call.", variant: "destructive" });
        }
      }
    } else {
      setSelectedFile(null);
      setFilePreview(null); 
      form.setValue('documentFile', null);
    }
  };

  const currentDocumentType = form.watch('documentType');

  const processSubmit = async (values: FormValues) => {
    if (!selectedFile) {
        toast({ title: "File Required", description: "Please select a document file to upload.", variant: "destructive"});
        return;
    }
    if (!values.expiryDate) {
        toast({ title: "Expiry Date Required", description: "Please set an expiry date for the document.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true);
    await onSubmit(
      {
        documentType: values.documentType,
        customTypeName: values.customTypeName,
        expiryDate: values.expiryDate ? format(values.expiryDate, 'yyyy-MM-dd') : null,
        documentFile: selectedFile || undefined,
      },
      aiExtractedDate,
      aiConfidence
    );
    setIsSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">
            {modalTitle}
          </DialogTitle>
          <DialogDescription>
            Upload a new version or instance of this document. It will be added to the vehicle's history.
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
                      setAiExtractedDate(null);
                      setAiConfidence(null);
                      setAiError(null);
                      // Auto-trigger AI if file already selected might be complex here
                      // User might need to re-select file if type changes and AI is desired
                    }} 
                    defaultValue={field.value}
                    // Type can be changed when adding new historical entry, even if context was provided
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
                      <Input placeholder="e.g., Special Permit XYZ" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <FormField
              control={form.control}
              name="documentFile"
              render={({ field }) => ( 
                <FormItem>
                  <FormLabel>Document File *</FormLabel>
                  <FormControl>
                    <Input 
                      type="file" 
                      accept=".pdf,.jpg,.jpeg,.png" 
                      onChange={handleFileChange}
                      className="text-sm"
                      required // File is always required for new historical entries
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {filePreview && selectedFile && (
              <div className="text-sm text-muted-foreground">
                Selected file: {selectedFile.name} ({ (selectedFile.size / 1024).toFixed(2) } KB)
              </div>
            )}


            {isExtractingDate && (
              <div className="flex items-center space-x-2 text-sm text-primary p-2 bg-primary/10 rounded-md">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Extracting expiry date using AI...</span>
              </div>
            )}
            {aiError && (
              <div className="flex items-center space-x-2 text-sm text-destructive p-2 bg-destructive/10 rounded-md">
                 <AlertCircle className="h-4 w-4" />
                <span>{aiError}</span>
              </div>
            )}
            {aiExtractedDate && !isExtractingDate && (
              <div className="text-sm text-green-600 p-2 bg-green-50 rounded-md">
                AI Suggested Expiry Date: {format(parseISO(aiExtractedDate), DATE_FORMAT)} (Confidence: {aiConfidence?.toFixed(2) ?? 'N/A'})
                <FormDescription>Please verify and adjust if needed.</FormDescription>
              </div>
            )}


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
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, DATE_FORMAT)
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date("1900-01-01") } 
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    {AI_SUPPORTED_DOCUMENT_TYPES.includes(form.getValues('documentType')) ? 
                    'AI may suggest a date. Please verify or set manually.' : 
                    'Select the expiry date manually.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
  );
}

