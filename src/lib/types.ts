

export type VehicleType = string; // Changed from union to string to allow custom types
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
  id:string;
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

export type UserRole = 'admin' | 'manager' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole; 
}

export interface VehicleComplianceStatusBreakdown {
  compliant: number;
  expiringSoon: number;
  overdue: number;
  missingInfo: number;
  total: number;
}
export interface SummaryStats {
  totalVehicles: number;
  compliantVehicles: number; // Vehicles where all docs are compliant
  expiringSoonDocuments: number; // Overall count of docs expiring soon
  overdueDocuments: number; // Overall count of overdue docs
  // Document-specific counts (optional, can be derived or explicitly added)
  expiringInsurance?: number;
  overdueInsurance?: number;
  expiringFitness?: number;
  overdueFitness?: number;
  expiringPUC?: number;
  overduePUC?: number;
  expiringAITP?: number;
  overdueAITP?: number;
  vehicleComplianceBreakdown: VehicleComplianceStatusBreakdown; // For pie chart
}


export type AuditLogAction = 
  | 'CREATE_VEHICLE' | 'UPDATE_VEHICLE' | 'DELETE_VEHICLE'
  | 'UPLOAD_DOCUMENT' | 'UPDATE_DOCUMENT' | 'DELETE_DOCUMENT'
  | 'MARK_ALERT_READ'
  | 'USER_LOGIN' | 'USER_LOGOUT' 
  | 'VIEW_REPORT' | 'EXPORT_REPORT'
  | 'SYSTEM_START';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO datetime string
  userId: string; 
  action: AuditLogAction;
  entityType: 'VEHICLE' | 'DOCUMENT' | 'ALERT' | 'USER' | 'SYSTEM' | 'REPORT';
  entityId?: string; 
  entityRegistration?: string; 
  details: Record<string, any>; 
}

export interface ReportableDocument extends VehicleDocument {
  vehicleRegistration: string;
  daysDifference: number; // positive for days left, negative for days overdue
}
