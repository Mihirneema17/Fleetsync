
import type { User as FirebaseUser } from 'firebase/auth';

export type VehicleType = string; // Changed from union to string to allow custom types
export type DocumentType = 'Insurance' | 'Fitness' | 'PUC' | 'AITP' | 'RegistrationCard' | 'Other'; // Pollution Under Control, All India Tourist Permit

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
  customTypeName?: string | null; // For 'Other' document type
  policyNumber?: string | null;
  startDate?: string | null;    // ISO Date string
  expiryDate: string | null; // ISO Date string
  documentUrl?: string | null; // Mock URL if not using actual storage
  documentName?: string | null; // Name of the uploaded file
  // storagePath?: string | null; // Removed as we are not using Firebase Storage for now
  status: 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'Missing'; // This status is for THIS specific document instance
  uploadedAt: string; // ISO datetime string when this document record was created/uploaded
  
  aiExtractedDate?: string | null; 
  aiConfidence?: number | null;   
  aiExtractedPolicyNumber?: string | null; 
  aiPolicyNumberConfidence?: number | null; 
  aiExtractedStartDate?: string | null; 
  aiStartDateConfidence?: number | null; 

  // AI Extracted details for Registration Card (specifically from smart-ingest-flow)
  aiExtractedRegistrationNumber?: string | null;
  aiRegistrationNumberConfidence?: number | null;
  aiExtractedMake?: string | null;
  aiMakeConfidence?: number | null;
  aiExtractedModel?: string | null;
  aiModelConfidence?: number | null;
}

export interface Alert {
  id:string;
  vehicleId: string;
  vehicleRegistration: string;
  documentType: DocumentType;
  customDocumentTypeName?: string;
  dueDate: string; // ISO Date string
  message: string;
  createdAt: string;
  isRead: boolean;
  userId?: string; // Should ideally be the Firebase Auth UID
  policyNumber?: string | null;
}

export type UserRole = 'admin' | 'manager' | 'viewer';

// This User interface will represent the data stored in our 'users' collection in Firestore.
export interface User {
  uid: string; // Firebase Auth User ID
  email: string | null;
  displayName?: string | null;
  role: UserRole;
  createdAt: string; // ISO datetime string
  avatarUrl?: string | null; // Optional, can be added later
}

// Re-export FirebaseUser if needed elsewhere, or use it directly
export type { FirebaseUser };


export interface VehicleComplianceStatusBreakdown {
  compliant: number;
  expiringSoon: number;
  overdue: number;
  missingInfo: number;
  total: number;
}
export interface SummaryStats {
  totalVehicles: number;
  compliantVehicles: number; 
  expiringSoonDocuments: number; 
  overdueDocuments: number; 
  expiringInsurance?: number;
  overdueInsurance?: number;
  expiringFitness?: number;
  overdueFitness?: number;
  expiringPUC?: number;
  overduePUC?: number;
  expiringAITP?: number;
  overdueAITP?: number;
  vehicleComplianceBreakdown: VehicleComplianceStatusBreakdown; 
}


export type AuditLogAction = 
  | 'CREATE_VEHICLE' | 'UPDATE_VEHICLE' | 'DELETE_VEHICLE'
  | 'UPLOAD_DOCUMENT' | 'UPDATE_DOCUMENT' | 'DELETE_DOCUMENT'
  | 'MARK_ALERT_READ'
  | 'USER_LOGIN' | 'USER_LOGOUT' | 'USER_SIGNUP' // Added USER_SIGNUP
  | 'VIEW_REPORT' | 'EXPORT_REPORT'
  | 'SYSTEM_DATA_INITIALIZED';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO datetime string
  userId: string; 
  action: AuditLogAction;
  entityType: 'VEHICLE' | 'DOCUMENT' | 'ALERT' | 'USER' | 'SYSTEM' | 'REPORT';
  entityId?: string | null; 
  entityRegistration?: string | null; 
  details: Record<string, any>; 
}

export interface ReportableDocument extends VehicleDocument {
  vehicleRegistration: string;
  daysDifference: number; // positive for days left, negative for days overdue
}

export interface SearchResultItem {
  id: string; // Unique ID for the result item (can be vehicle.id or document.id_vehicle.id)
  type: 'vehicle' | 'document';
  title: string; // e.g., Vehicle Registration or Document Type
  description?: string; // e.g., Make Model or Policy Number
  link: string; // URL to navigate to
  vehicleId?: string; // To construct document links if needed
  documentId?: string; // To scroll to document if it's a document result
}
