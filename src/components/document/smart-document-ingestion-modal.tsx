
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
import { Loader2, AlertCircle } from 'lucide-react';
import type { SmartIngestOutput } from '@/ai/flows/smart-ingest-flow'; // Will be used in next steps

interface SmartDocumentIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  // onProcess: (file: File) => Promise<void>; // Will be implemented in next step
}

export function SmartDocumentIngestionModal({
  isOpen,
  onClose,
  // onProcess,
}: SmartDocumentIngestionModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiResults, setAiResults] = useState<SmartIngestOutput | null>(null); // To be populated by AI
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setPreviewError("File is too large. Maximum size is 5MB.");
        setSelectedFile(null);
        return;
      }
      // Check file type (optional, but good practice)
      const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        setPreviewError("Invalid file type. Please upload a PDF, JPG, PNG, or WEBP file.");
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setPreviewError(null);
      setAiResults(null); // Reset AI results when a new file is selected
    } else {
      setSelectedFile(null);
      setPreviewError(null);
    }
  };

  const handleProcessDocument = async () => {
    if (!selectedFile) {
      setPreviewError("Please select a file to process.");
      return;
    }
    // AI Processing logic will be added in Step D
    setIsProcessingAI(true);
    // Simulate AI processing for now
    await new Promise(resolve => setTimeout(resolve, 2000));
    setAiResults({ // Dummy results for placeholder
        vehicleRegistrationNumber: "MH12AB1234",
        vehicleRegistrationNumberConfidence: 0.95,
        documentTypeSuggestion: "Insurance",
        documentTypeConfidence: 0.9,
        customTypeNameSuggestion: null,
        policyNumber: "POL123XYZ",
        policyNumberConfidence: 0.88,
        startDate: "2023-01-01",
        startDateConfidence: 0.85,
        expiryDate: "2024-01-01",
        expiryDateConfidence: 0.92,
    });
    setIsProcessingAI(false);
    // Call actual onProcess function in Step D
    // await onProcess(selectedFile);
  };

  const resetAndClose = () => {
    setSelectedFile(null);
    setIsProcessingAI(false);
    setAiResults(null);
    setPreviewError(null);
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
          {previewError && (
            <div className="text-sm text-destructive flex items-center">
              <AlertCircle className="mr-2 h-4 w-4" /> {previewError}
            </div>
          )}
          {selectedFile && !previewError && (
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

          {/* Placeholder for AI Results and Correction Form - To be built in Step E */}
          {aiResults && !isProcessingAI && (
            <div className="p-4 border rounded-md bg-muted/50">
              <h3 className="font-semibold mb-2 text-sm">AI Extracted Details (Placeholder):</h3>
              <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(aiResults, null, 2)}</pre>
              <p className="text-xs text-muted-foreground mt-2">
                You will be able to review and correct these details in the next step.
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
            onClick={handleProcessDocument} 
            disabled={!selectedFile || isProcessingAI || !!previewError}
          >
            {isProcessingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {aiResults ? "Next (Review &amp; Save)" : "Upload &amp; Process"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
