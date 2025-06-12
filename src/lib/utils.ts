import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Vehicle, DocumentType, VehicleDocument } from './types';
import { parseISO, isBefore, differenceInDays } from 'date-fns';
import { EXPIRY_WARNING_DAYS } from './constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Moved from data.ts
export const getDocumentComplianceStatus = (expiryDate: string | null): VehicleDocument['status'] => {
  if (!expiryDate || typeof expiryDate !== 'string' || expiryDate.trim() === '') return 'Missing';
  const now = new Date();
  const expDate = parseISO(expiryDate);
  expDate.setHours(23, 59, 59, 999); // Consider full day for expiry
  now.setHours(0,0,0,0); // Start of today

  if (isBefore(expDate, now)) return 'Overdue';
  if (differenceInDays(expDate, now) < EXPIRY_WARNING_DAYS) return 'ExpiringSoon';
  return 'Compliant';
};

// Moved from data.ts
export const getLatestDocumentForType = (vehicle: Pick<Vehicle, 'id' | 'documents'>, docType: DocumentType, customTypeName?: string): VehicleDocument | undefined => {
  const docsOfType = (vehicle.documents || []).filter(d =>
      d.type === docType &&
      (docType !== 'Other' || d.customTypeName === customTypeName) &&
      d.expiryDate // Only consider documents with an expiry date as active
  );
  if (docsOfType.length === 0) return undefined;

  docsOfType.sort((a, b) => {
      if (a.expiryDate && b.expiryDate) {
           const expiryDiff = parseISO(b.expiryDate).getTime() - parseISO(a.expiryDate).getTime();
           if (expiryDiff !== 0) return expiryDiff;
      } else if (a.expiryDate) {
          return -1;
      } else if (b.expiryDate) {
          return 1;
      }
      // If expiry dates are the same or one is null, sort by uploadedAt descending
      return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
  });
  return docsOfType[0];
};
