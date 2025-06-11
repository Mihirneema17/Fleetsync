
"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, AlertCircle, UploadCloud } from 'lucide-react';
import { smartIngestDocument, type SmartIngestOutput, type SmartIngestInput } from '@/ai/flows/smart-ingest-flow';
import { useToast } from '@/hooks/use-toast';

interface SmartDocumentIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  // onProcess is for Step F - actual form submission and saving
  // onProcess: (file: File, aiData: SmartIngestOutput) => Promise<void>; 
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
  const { toast } = useToast();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setAiResults(null); // Reset AI results when a new file is selected
    setProcessingError(null); // Reset errors

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
      
      // Automatically trigger AI processing when file is selected
      await processWithAI(file);

    } else {
      setSelectedFile(null);
      setProcessingError(null);
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
          setProcessingError("AI processing failed. Please try again or enter details manually.");
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
        toast({ title: "File Read Error", description: "Could not read the file.", variant = "destructive" });
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error("File processing error before AI:", e);
      setProcessingError("Error preparing file for AI. Please try again.");
      setIsProcessingAI(false);
      toast({ title: "File Error", description: "Could not prepare file for AI.", variant = "destructive" });
    }
  };


  const handleModalSubmitOrNext = async () => {
    if (aiResults) {
      // Logic for Step E/F: Pass aiResults to next stage (e.g. open a form prefilled with aiResults)
      // For now, we'll just log it and potentially close the modal or reset for another upload.
      console.log("AI Results to be used for form prefill:", aiResults);
      toast({ title: "Next Step: Review", description: "Review and save functionality will be implemented next."});
      // In a real flow, you might pass `aiResults` to another component/modal or update parent state.
      // For now, let's keep the modal open to see the results, or the user can cancel/close.
    } else if (selectedFile && !isProcessingAI) {
      // This case should ideally not be hit if AI processes automatically on file selection.
      // But if we had a separate "Process" button:
      await processWithAI(selectedFile);
    } else if (!selectedFile) {
        setProcessingError("Please select a file first.");
    }
  };

  const resetAndClose = () => {
    setSelectedFile(null);
    setIsProcessingAI(false);
    setAiResults(null);
    setProcessingError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetAndClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">Smart Document Upload</DialogTitle>
          <DialogDescription>
            Upload a document (PDF, JPG, PNG, WEBP - max 5MB). AI will attempt to extract key details.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={handleFileChange}
            disabled={isProcessingAI}
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
              <span>Processing with AI... Please wait.</span>
            </div>
          )}

          {aiResults && !isProcessingAI && (
            <div className="p-4 border rounded-md bg-muted/50 max-h-60 overflow-y-auto">
              <h3 className="font-semibold mb-2 text-sm">AI Extracted Details (Raw):</h3>
              <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(aiResults, null, 2)}</pre>
              <p className="text-xs text-muted-foreground mt-2">
                Next step: Review and correct these details in a form.
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={resetAndClose} disabled={isProcessingAI}>
            Cancel
          </Button>
          <Button 
            type="button" 
            onClick={handleModalSubmitOrNext} 
            disabled={!selectedFile || isProcessingAI || !!processingError && !aiResults}
          >
            {isProcessingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (aiResults ? <UploadCloud className="mr-2 h-4 w-4" /> : null) }
            {aiResults ? "Next (Review & Save)" : "Upload & Process"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
 