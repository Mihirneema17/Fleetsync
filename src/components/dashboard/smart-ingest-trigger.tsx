
"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UploadCloud } from 'lucide-react';
import { SmartDocumentIngestionModal } from '@/components/document/smart-document-ingestion-modal';

export function SmartIngestTrigger() {
  const [isSmartIngestModalOpen, setIsSmartIngestModalOpen] = useState(false);

  return (
    <>
      <div className="flex justify-start py-2">
        <Button onClick={() => setIsSmartIngestModalOpen(true)} size="lg">
          <UploadCloud className="mr-2 h-5 w-5" /> Smart Document Upload
        </Button>
      </div>

      {isSmartIngestModalOpen && (
        <SmartDocumentIngestionModal
          isOpen={isSmartIngestModalOpen}
          onClose={() => setIsSmartIngestModalOpen(false)}
        />
      )}
    </>
  );
}
