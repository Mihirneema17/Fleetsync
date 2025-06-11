
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
import { CalendarIcon, Loader2, FileText, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, isValid } from 'date-fns';
import { DOCUMENT_TYPES, AI_SUPPORTED_DOCUMENT_TYPES, DATE_FORMAT } from '@/lib/constants';
import type { DocumentType, VehicleDocument } from '@/lib/types';
import type { ExtractExpiryDateInput, ExtractExpiryDateOutput } from '@/ai/flows/extract-expiry-date';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const generateClientSideId = () => Math.random().toString(36).substr(2, 9);

const formSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES as [string, ...string[]]),
  customTypeName: z.string().optional(),
  policyNumber: z.string().max(50, "Policy number too long").optional().nullable(),
  startDate: z.date().nullable(),
  expiryDate: z.date().nullable(),
  documentFile: z.instanceof(File).optional().nullable(),
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
      documentFile?: File; // For actual upload later
      documentName?: string; // Filename
      documentUrl?: string; // Mock URL
    },
    aiExtractedPolicyNumber?: string | null,
    aiPolicyNumberConfidence?: number | null,
    aiExtractedStartDate?: string | null,
    aiStartDateConfidence?: number | null,
    aiExtractedExpiryDate?: string | null,
    aiExpiryDateConfidence?: number | null
  ) => Promise<void>;
  vehicleId: string;
  initialDocumentData?: Partial<VehicleDocument> | { type: DocumentType, customTypeName?: string } | null;
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

  const [aiExtractedPolicyNumber, setAiExtractedPolicyNumber] = useState<string | null>(null);
  const [aiPolicyNumberConfidence, setAiPolicyNumberConfidence] = useState<number | null>(null);
  const [aiExtractedStartDate, setAiExtractedStartDate] = useState<string | null>(null);
  const [aiStartDateConfidence, setAiStartDateConfidence] = useState<number | null>(null);
  const [aiExtractedExpiryDate, setAiExtractedExpiryDate] = useState<string | null>(null);
  const [aiExpiryDateConfidence, setAiExpiryDateConfidence] = useState<number | null>(null);

  const [aiError, setAiError] = useState<string | null>(null);
  const { toast } = useToast();

  const modalTitle = "Upload New Document Version";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      documentType: initialDocumentData?.type || 'Insurance',
      customTypeName: initialDocumentData?.customTypeName || '',
      policyNumber: '',
      startDate: null,
      expiryDate: null,
      documentFile: null,
    },
  });

  useEffect(() => {
    form.reset({
      documentType: initialDocumentData?.type || 'Insurance',
      customTypeName: initialDocumentData?.customTypeName || '',
      policyNumber: '',
      startDate: null,
      expiryDate: null,
      documentFile: null,
    });
    setAiExtractedPolicyNumber(null);
    setAiPolicyNumberConfidence(null);
    setAiExtractedStartDate(null);
    setAiStartDateConfidence(null);
    setAiExtractedExpiryDate(null);
    setAiExpiryDateConfidence(null);
    setSelectedFile(null);
    setFilePreview(null);
    setAiError(null);
  }, [initialDocumentData, form, isOpen]);


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
      form.setValue('documentFile', file);
      setAiError(null);
      // Reset AI fields on new file
      setAiExtractedPolicyNumber(null);
      setAiPolicyNumberConfidence(null);
      setAiExtractedStartDate(null);
      setAiStartDateConfidence(null);
      setAiExtractedExpiryDate(null);
      setAiExpiryDateConfidence(null);

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

              setAiExtractedPolicyNumber(result.policyNumber);
              setAiPolicyNumberConfidence(result.policyNumberConfidence);
              if (result.policyNumber) {
                form.setValue('policyNumber', result.policyNumber);
                toast({ title: "AI Extraction", description: `Suggested Policy #: ${result.policyNumber} (Conf: ${result.policyNumberConfidence?.toFixed(2) ?? 'N/A'})` });
              }

              setAiExtractedStartDate(result.startDate);
              setAiStartDateConfidence(result.startDateConfidence);
              if (result.startDate && isValid(parseISO(result.startDate))) {
                form.setValue('startDate', parseISO(result.startDate));
                 toast({ title: "AI Extraction", description: `Suggested Start Date: ${format(parseISO(result.startDate), DATE_FORMAT)} (Conf: ${result.startDateConfidence?.toFixed(2) ?? 'N/A'})` });
              }

              setAiExtractedExpiryDate(result.expiryDate);
              setAiExpiryDateConfidence(result.confidence);
              if (result.expiryDate && isValid(parseISO(result.expiryDate))) {
                form.setValue('expiryDate', parseISO(result.expiryDate));
                toast({ title: "AI Extraction", description: `Suggested Expiry Date: ${format(parseISO(result.expiryDate), DATE_FORMAT)} (Conf: ${result.confidence?.toFixed(2) ?? 'N/A'})` });
              } else if (result.expiryDate === null && result.startDate === null && result.policyNumber === null ) {
                 toast({ title: "AI Extraction", description: "AI could not find any details.", variant: "default" });
              }
            } catch (e) {
              console.error("AI extraction error:", e);
              setAiError("Failed to extract details using AI. Please enter manually.");
              toast({ title: "AI Error", description: "AI data extraction failed.", variant: "destructive" });
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
    const clientSideDocId = generateClientSideId();
    const generatedDocumentUrl = `/uploads/mock/vehicle_${vehicleId}/doc_${clientSideDocId}/${selectedFile.name}`;

    await onSubmit(
      {
        documentType: values.documentType,
        customTypeName: values.customTypeName,
        policyNumber: values.policyNumber,
        startDate: values.startDate ? format(values.startDate, 'yyyy-MM-dd') : null,
        expiryDate: values.expiryDate ? format(values.expiryDate, 'yyyy-MM-dd') : null,
        documentFile: selectedFile,
        documentName: selectedFile.name,
        documentUrl: generatedDocumentUrl,
      },
      aiExtractedPolicyNumber,
      aiPolicyNumberConfidence,
      aiExtractedStartDate,
      aiStartDateConfidence,
      aiExtractedExpiryDate,
      aiExpiryDateConfidence
    );
    setIsSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
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
                      setAiExtractedPolicyNumber(null); setAiPolicyNumberConfidence(null);
                      setAiExtractedStartDate(null); setAiStartDateConfidence(null);
                      setAiExtractedExpiryDate(null); setAiExpiryDateConfidence(null);
                      setAiError(null);
                    }}
                    defaultValue={field.value}
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
                      required
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
                <span>Extracting document details using AI...</span>
              </div>
            )}
            {aiError && (
              <div className="flex items-center space-x-2 text-sm text-destructive p-2 bg-destructive/10 rounded-md">
                 <AlertCircle className="h-4 w-4" />
                <span>{aiError}</span>
              </div>
            )}

            {(!isExtractingDate && (aiExtractedPolicyNumber || aiExtractedStartDate || aiExtractedExpiryDate)) && (
                <Card className="p-3 bg-muted/50">
                    <CardHeader className="p-0 pb-2">
                         <CardTitle className="text-sm font-medium flex items-center"><Info className="w-4 h-4 mr-2 text-blue-500"/>AI Suggested Details:</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-1 p-0">
                        {aiExtractedPolicyNumber && (
                            <div>Policy #: {aiExtractedPolicyNumber} (Conf: {aiPolicyNumberConfidence?.toFixed(2) ?? 'N/A'})</div>
                        )}
                        {aiExtractedStartDate && (
                            <div>Start Date: {format(parseISO(aiExtractedStartDate), DATE_FORMAT)} (Conf: {aiStartDateConfidence?.toFixed(2) ?? 'N/A'})</div>
                        )}
                        {aiExtractedExpiryDate && (
                            <div>Expiry Date: {format(parseISO(aiExtractedExpiryDate), DATE_FORMAT)} (Conf: {aiExpiryDateConfidence?.toFixed(2) ?? 'N/A'})</div>
                        )}
                         <FormDescription className="pt-1">Please verify and adjust if needed.</FormDescription>
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
                    <Input placeholder="Enter policy or document number" {...field} value={field.value ?? ''} />
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
             <FormDescription className="text-xs">
                {AI_SUPPORTED_DOCUMENT_TYPES.includes(form.getValues('documentType')) ?
                'AI may suggest details if a file is selected. Please verify or set manually.' :
                'Please enter details manually.'}
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
  );
}

    