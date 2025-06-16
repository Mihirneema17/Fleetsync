
import type { DocumentType } from './types';

// VEHICLE_TYPES now serves as a list of suggestions for the input field
export const VEHICLE_TYPES: string[] = ['Car', 'Truck', 'Bus', 'Van', 'Motorcycle', 'SUV', 'Trailer', 'Tractor'];

export const DOCUMENT_TYPES: DocumentType[] = ['Insurance', 'Fitness', 'PUC', 'AITP', 'RegistrationCard', 'Other'];

export const AI_SUPPORTED_DOCUMENT_TYPES: DocumentType[] = ['Insurance', 'Fitness', 'PUC'];

export const EXPIRY_WARNING_DAYS = 30; // Documents expiring within 30 days are considered "Expiring Soon"

export const DATE_FORMAT = "yyyy-MM-dd";

export const MOCK_USER_ID = "user_123_admin"; // Changed ID slightly to imply admin for demo

export const AUDIT_LOG_ACTIONS: AuditLogAction[] = [
  'CREATE_VEHICLE', 'UPDATE_VEHICLE', 'DELETE_VEHICLE',
  'UPLOAD_DOCUMENT', 'UPDATE_DOCUMENT', 'DELETE_DOCUMENT',
  'MARK_ALERT_READ', 'VIEW_REPORT', 'EXPORT_REPORT'
];

export const AUDIT_ENTITY_TYPES: AuditLogEntry['entityType'][] = [
  'VEHICLE', 'DOCUMENT', 'ALERT', 'USER', 'SYSTEM', 'REPORT'
];
