

export type VehicleType = 'Car' | 'Truck' | 'Bus' | 'Van' | 'Motorcycle' | 'Other';
export type DocumentType = 'Insurance' | 'Fitness' | 'PUC' | 'AITP' | 'Other'; // Pollution Under Control, All India Tourist Permit

export interface Vehicle {
  id: string;
  registrationNumber: string;
  type: VehicleType;
  make: string;
  model: string;
  documents: VehicleDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface VehicleDocument {
  id: string;
  vehicleId: string;
  type: DocumentType;
  customTypeName?: string; // For 'Other' document type
  expiryDate: string | null; // ISO Date string
  documentUrl?: string; // URL to the stored document
  status: 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'Missing';
  uploadedAt: string;
  verifiedAt?: string; // If AI verification workflow is used
  aiExtractedDate?: string | null;
  aiConfidence?: number | null;
}

export interface Alert {
  id: string;
  vehicleId: string;
  vehicleRegistration: string;
  documentType: DocumentType;
  customDocumentTypeName?: string;
  dueDate: string; // ISO Date string
  message: string;
  createdAt: string;
  isRead: boolean;
  // Added userId to scope alerts per user in a multi-user scenario (mocked for now)
  userId?: string; 
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface SummaryStats {
  totalVehicles: number;
  compliantVehicles: number;
  expiringSoonDocuments: number; // General count of all docs expiring soon
  overdueDocuments: number; // General count of all docs overdue
}

