import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Vehicle, DocumentType, VehicleDocument } from './types';
import { parseISO, isBefore, differenceInDays, isValid } from 'date-fns';
import { EXPIRY_WARNING_DAYS } from './constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getDocumentComplianceStatus = (expiryDate: string | null): VehicleDocument['status'] => {
  // Check for null, undefined, empty string, or invalid date format
  if (!expiryDate || !isValid(parseISO(expiryDate))) {
    return 'Missing';
  }
  
  const now = new Date();
  const expDate = parseISO(expiryDate);
  expDate.setHours(23, 59, 59, 999); 
  now.setHours(0, 0, 0, 0);

  if (isBefore(expDate, now)) return 'Overdue';
  if (differenceInDays(expDate, now) <= EXPIRY_WARNING_DAYS) return 'ExpiringSoon';
  return 'Compliant';
};

export const getLatestDocumentForType = (vehicle: Pick<Vehicle, 'id' | 'documents'>, docType: DocumentType, customTypeName?: string): VehicleDocument | undefined => {
  const docsOfType = (vehicle.documents || []).filter(d =>
      d.type === docType &&
      (docType !== 'Other' || d.customTypeName === customTypeName) &&
      d.expiryDate && // Ensure expiryDate exists...
      isValid(parseISO(d.expiryDate)) // ...and is a valid date string
  );
  if (docsOfType.length === 0) return undefined;

  docsOfType.sort((a, b) => {
    // We know expiryDate is valid and non-null here because of the filter above.
    const expiryDiff = parseISO(b.expiryDate!).getTime() - parseISO(a.expiryDate!).getTime();
    if (expiryDiff !== 0) return expiryDiff;
    
    // Fallback to uploadedAt if expiry dates are identical
    return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
  });
  return docsOfType[0];
};
