import type { VehicleType, DocumentType } from './types';

export const VEHICLE_TYPES: VehicleType[] = ['Car', 'Truck', 'Bus', 'Van', 'Motorcycle', 'Other'];

export const DOCUMENT_TYPES: DocumentType[] = ['Insurance', 'Fitness', 'PUC', 'AITP', 'Other'];

export const AI_SUPPORTED_DOCUMENT_TYPES: DocumentType[] = ['Insurance', 'Fitness', 'PUC'];

export const EXPIRY_WARNING_DAYS = 30; // Documents expiring within 30 days are considered "Expiring Soon"

export const DATE_FORMAT = "yyyy-MM-dd";

export const MOCK_USER_ID = "user_123";
