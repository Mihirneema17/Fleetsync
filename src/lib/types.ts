
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
  expiryDate: string | null; // ISO Date string (user-confirmed or manually set)
  documentUrl?: string; // URL to the stored document
  documentName?: string; // Name of the uploaded file
  status: 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'Missing';
  uploadedAt: string;
  aiExtractedDate?: string | null; // Date extracted by AI
  aiConfidence?: number | null;   // Confidence score from AI
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
  expiringSoonDocuments: number; // Overall count
  overdueDocuments: number; // Overall count
}


export type AuditLogAction = 
  | 'CREATE_VEHICLE' | 'UPDATE_VEHICLE' | 'DELETE_VEHICLE'
  | 'UPLOAD_DOCUMENT' | 'UPDATE_DOCUMENT' | 'DELETE_DOCUMENT'
  | 'MARK_ALERT_READ';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO datetime string
  userId: string; // Or system if no user context
  action: AuditLogAction;
  entityType: 'VEHICLE' | 'DOCUMENT' | 'ALERT';
  entityId: string;
  entityRegistration?: string; // For quick ref like vehicle reg number
  details: Record<string, any>; // Flexible JSON blob for action-specific details
}

export interface ReportableDocument extends VehicleDocument {
  vehicleRegistration: string;
  // vehicleId is already in VehicleDocument
  daysDifference: number; // positive for days left, negative for days overdue
}