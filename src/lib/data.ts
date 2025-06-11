

import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, AuditLogEntry, AuditLogAction, DocumentType, ReportableDocument, UserRole, VehicleComplianceStatusBreakdown } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID, AI_SUPPORTED_DOCUMENT_TYPES } from './constants';
import { format, formatISO, addDays, isBefore, parseISO, differenceInDays, isAfter } from 'date-fns';

let vehicles: Vehicle[] = [];
let alerts: Alert[] = [];
let auditLogs: AuditLogEntry[] = [];

const generateId = () => Math.random().toString(36).substr(2, 9);

// Internal audit logging function
const internalLogAuditEvent = (
  action: AuditLogAction,
  entityType: AuditLogEntry['entityType'],
  entityId?: string,
  details: Record<string, any> = {},
  entityRegistration?: string
) => {
  auditLogs.push({
    id: generateId(),
    timestamp: formatISO(new Date()),
    userId: MOCK_USER_ID, 
    action,
    entityType,
    entityId,
    entityRegistration,
    details,
  });
};


const initializeDummyData = () => {
  if (vehicles.length > 0 && alerts.length > 0) return; 

  const today = new Date();
  const initialVehiclesData: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>[] = [
    { registrationNumber: 'MH12AB1234', type: 'Car', make: 'Toyota', model: 'Camry' },
    { registrationNumber: 'KA01CD5678', type: 'Truck', make: 'Volvo', model: 'FH' },
    { registrationNumber: 'DL03EF9012', type: 'Bus', make: 'Tata', model: 'Marcopolo' },
    { registrationNumber: 'TN07GH4567', type: 'Van', make: 'Force', model: 'Traveller' },
  ];
   
  vehicles = initialVehiclesData.map((v, vehicleIndex) => {
    const vehicleId = generateId();
    const createdAt = formatISO(addDays(today, - (vehicleIndex * 150 + Math.floor(Math.random() * 30)) )); 
    const vehicleInstance: Vehicle = {
      ...v,
      id: vehicleId,
      createdAt,
      updatedAt: createdAt,
      documents: [] 
    };

    // Create historical documents
    for (let yearOffset = -2; yearOffset <= 0; yearOffset++) { // Create docs for last 2 years and current year
        DOCUMENT_TYPES.forEach(docType => {
            // Skip AITP for Cars for some historical records to show variety
            if (docType === 'AITP' && v.type === 'Car' && yearOffset < 0) return;

            const baseDate = addDays(today, yearOffset * 365); // Base for this year's document
            let expiryDate: Date | null = null;
            const randDays = Math.random();
            
            // Current year documents (yearOffset === 0)
            if (yearOffset === 0) {
                if (vehicleIndex === 0) { // Specific scenarios for MH12AB1234
                    if (docType === 'Insurance') expiryDate = addDays(today, 10); 
                    else if (docType === 'Fitness') expiryDate = addDays(today, -5); 
                    else if (docType === 'PUC') expiryDate = addDays(today, 45); 
                    else if (docType === 'AITP') expiryDate = null; // No AITP for this car
                } else if (vehicleIndex === 1) { // Specific scenarios for KA01CD5678
                    if (docType === 'Insurance') expiryDate = addDays(today, 60); 
                    else if (docType === 'Fitness') expiryDate = addDays(today, 20); 
                    else if (docType === 'PUC') expiryDate = addDays(today, -15); 
                    else if (docType === 'AITP') expiryDate = addDays(today, 100); 
                } else { // Generic for other current year docs
                     const offset = Math.floor(randDays * 120) - 30; // -30 to +90 days from today
                     if (docType === 'AITP' && v.type === 'Car') expiryDate = null;
                     else if (Math.random() < 0.1) expiryDate = null; // 10% chance of missing current doc
                     else expiryDate = addDays(today, offset);
                }
            } else { // Historical documents (yearOffset < 0)
                // Expired on a random day in their respective year or slightly after
                 expiryDate = addDays(baseDate, Math.floor(Math.random() * 365) + (Math.random() > 0.7 ? 0 : -30));
                 // Ensure historical docs are indeed in the past
                 if (isAfter(expiryDate, addDays(today, -1))) {
                    expiryDate = addDays(today, - (Math.floor(Math.random()*100)+1)); // make sure it's past
                 }
            }
            
            const docUploadedAt = expiryDate ? formatISO(addDays(expiryDate, -(Math.floor(Math.random() * 90) + 30))) : formatISO(addDays(baseDate, -Math.floor(Math.random() * 30)));
            const doc: VehicleDocument = {
              id: generateId(),
              vehicleId,
              type: docType,
              customTypeName: docType === 'Other' ? 'Permit ' + Math.floor(Math.random()*10) : undefined,
              expiryDate: expiryDate ? formatISO(expiryDate, { representation: 'date' }) : null,
              status: 'Missing', // Will be calculated
              uploadedAt: docUploadedAt,
              documentName: expiryDate ? `${docType}_${v.registrationNumber}_${yearOffset === 0 ? 'current' : `hist_${Math.abs(yearOffset)}`}.pdf` : undefined,
              documentUrl: expiryDate ? `/uploads/mock/${docType}_${v.registrationNumber}.pdf` : undefined, 
              aiExtractedDate: AI_SUPPORTED_DOCUMENT_TYPES.includes(docType) && expiryDate && Math.random() > 0.5 ? formatISO(addDays(expiryDate, Math.floor(Math.random()*6)-3), {representation: 'date'}) : null,
              aiConfidence: AI_SUPPORTED_DOCUMENT_TYPES.includes(docType) && expiryDate && Math.random() > 0.5 ? Math.random() : null,
            };
            doc.status = getDocumentComplianceStatus(doc.expiryDate);
            vehicleInstance.documents.push(doc);
      });
    }
    internalLogAuditEvent('CREATE_VEHICLE', 'VEHICLE', vehicleInstance.id, { registrationNumber: vehicleInstance.registrationNumber, make: vehicleInstance.make, model: vehicleInstance.model, type: vehicleInstance.type }, vehicleInstance.registrationNumber);
    return vehicleInstance;
  });
  generateAllAlerts(); 
  internalLogAuditEvent('SYSTEM_START', 'SYSTEM', undefined, { message: 'Dummy data initialized' });
};


export const getDocumentComplianceStatus = (expiryDate: string | null): VehicleDocument['status'] => {
  if (!expiryDate) return 'Missing';
  const now = new Date();
  const expDate = parseISO(expiryDate);
  expDate.setHours(23, 59, 59, 999); 
  now.setHours(0,0,0,0); 

  if (isBefore(expDate, now)) return 'Overdue';
  if (differenceInDays(expDate, now) < EXPIRY_WARNING_DAYS) return 'ExpiringSoon'; 
  return 'Compliant';
};


export async function getVehicles(): Promise<Vehicle[]> {
  initializeDummyData();
  return JSON.parse(JSON.stringify(vehicles.sort((a,b) => a.registrationNumber.localeCompare(b.registrationNumber)))); 
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  initializeDummyData();
  const vehicle = vehicles.find(v => v.id === id);
  if (vehicle) {
    // Sort documents within the vehicle: by type, then by expiryDate descending (nulls last or first based on preference)
    vehicle.documents.sort((a, b) => {
        if (a.type < b.type) return -1;
        if (a.type > b.type) return 1;
        // if types are same, sort by expiry date (newest first, nulls can go last)
        if (a.expiryDate === null) return 1;
        if (b.expiryDate === null) return -1;
        return parseISO(b.expiryDate).getTime() - parseISO(a.expiryDate).getTime();
    });
    return JSON.parse(JSON.stringify(vehicle));
  }
  return undefined;
}


export async function addVehicle(vehicleData: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>): Promise<Vehicle> {
  initializeDummyData();
  const vehicleId = generateId();
  const nowISO = formatISO(new Date());

  const newVehicle: Vehicle = {
    ...vehicleData,
    id: vehicleId,
    documents: [], // Start with no documents; they will be added via addOrUpdateDocument
    createdAt: nowISO,
    updatedAt: nowISO,
  };
  // Add placeholder "Missing" documents for all standard types initially
  DOCUMENT_TYPES.forEach(docType => {
    newVehicle.documents.push({
      id: generateId(),
      vehicleId: vehicleId,
      type: docType,
      customTypeName: docType === 'Other' ? 'Default Custom' : undefined,
      expiryDate: null,
      status: 'Missing',
      uploadedAt: nowISO, // Or perhaps a distinct 'entryCreatedAt'
    });
  });

  vehicles.push(newVehicle);
  internalLogAuditEvent('CREATE_VEHICLE', 'VEHICLE', newVehicle.id, { registrationNumber: newVehicle.registrationNumber, make: newVehicle.make, model: newVehicle.model, type: newVehicle.type }, newVehicle.registrationNumber);
  generateAlertsForVehicle(newVehicle); 
  return JSON.parse(JSON.stringify(newVehicle));
}

export async function updateVehicle(id: string, updates: Partial<Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>>): Promise<Vehicle | undefined> {
  initializeDummyData();
  const vehicleIndex = vehicles.findIndex(v => v.id === id);
  if (vehicleIndex === -1) return undefined;
  
  const oldVehicleData = { ...vehicles[vehicleIndex] };
  vehicles[vehicleIndex] = { ...vehicles[vehicleIndex], ...updates, updatedAt: formatISO(new Date()) };
  
  const changedFields: Record<string, any> = {};
  for (const key in updates) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      const typedKey = key as keyof typeof updates;
      if (updates[typedKey] !== oldVehicleData[typedKey]) {
        changedFields[typedKey] = { old: oldVehicleData[typedKey], new: updates[typedKey] };
      }
    }
  }
  if (Object.keys(changedFields).length > 0) {
    internalLogAuditEvent('UPDATE_VEHICLE', 'VEHICLE', id, { updates: changedFields }, vehicles[vehicleIndex].registrationNumber);
  }
  generateAlertsForVehicle(vehicles[vehicleIndex]); 
  return JSON.parse(JSON.stringify(vehicles[vehicleIndex]));
}

export async function deleteVehicle(id: string): Promise<boolean> {
  initializeDummyData();
  const vehicleIndex = vehicles.findIndex(v => v.id === id);
  if (vehicleIndex === -1) return false;

  const vehicleToDelete = vehicles[vehicleIndex];
  vehicles.splice(vehicleIndex, 1); 
  alerts = alerts.filter(a => a.vehicleId !== id); 

  internalLogAuditEvent('DELETE_VEHICLE', 'VEHICLE', id, { registrationNumber: vehicleToDelete.registrationNumber }, vehicleToDelete.registrationNumber);
  return true;
}


// This function now ALWAYS adds a new document record, creating a history.
export async function addOrUpdateDocument(
  vehicleId: string,
  docData: { // More specific type for clarity
    type: DocumentType;
    customTypeName?: string;
    expiryDate: string | null;
    documentName?: string;
    aiExtractedDate?: string | null;
    aiConfidence?: number | null;
  }
): Promise<Vehicle | undefined> {
  initializeDummyData();
  const vehicleIndex = vehicles.findIndex(v => v.id === vehicleId);
  if (vehicleIndex === -1) return undefined;

  const vehicle = vehicles[vehicleIndex];
  const newDocId = generateId();
  const status = getDocumentComplianceStatus(docData.expiryDate);
  const documentUrl = docData.documentName ? `/uploads/mock/${vehicle.registrationNumber}/${docData.documentName}` : undefined;
  const uploadedAt = formatISO(new Date());

  const newDocument: VehicleDocument = {
    id: newDocId,
    vehicleId,
    type: docData.type,
    customTypeName: docData.customTypeName,
    expiryDate: docData.expiryDate,
    documentUrl,
    documentName: docData.documentName,
    status,
    uploadedAt,
    aiExtractedDate: docData.aiExtractedDate,
    aiConfidence: docData.aiConfidence,
  };

  vehicle.documents.push(newDocument);
  
  // If an old "Missing" placeholder for this type exists, remove it
  const missingPlaceholderIndex = vehicle.documents.findIndex(d => 
    d.type === newDocument.type && 
    (d.type !== 'Other' || d.customTypeName === newDocument.customTypeName) &&
    d.status === 'Missing' && d.id !== newDocId && !d.expiryDate // Ensure it's truly a placeholder
  );
  if (missingPlaceholderIndex > -1) {
    vehicle.documents.splice(missingPlaceholderIndex, 1);
  }

  vehicles[vehicleIndex].updatedAt = formatISO(new Date()); 

  internalLogAuditEvent('UPLOAD_DOCUMENT', 'DOCUMENT', newDocId, { // Action is always UPLOAD_DOCUMENT for new historical entries
    documentType: docData.type,
    customTypeName: docData.customTypeName,
    expiryDate: docData.expiryDate,
    documentName: docData.documentName,
    aiExtractedDate: docData.aiExtractedDate,
    aiConfidence: docData.aiConfidence,
  }, vehicle.registrationNumber);

  generateAlertsForVehicle(vehicle); 
  return JSON.parse(JSON.stringify(vehicle));
}

// Helper to get the latest document of a specific type for a vehicle
const getLatestDocumentForType = (vehicle: Vehicle, docType: DocumentType, customTypeName?: string): VehicleDocument | undefined => {
    const docsOfType = vehicle.documents.filter(d => 
        d.type === docType && 
        (docType !== 'Other' || d.customTypeName === customTypeName)
    );
    if (docsOfType.length === 0) return undefined;
    // Sort by expiry date descending (latest expiry first), then by uploadedAt descending as a tie-breaker
    docsOfType.sort((a, b) => {
        if (a.expiryDate && b.expiryDate) {
            const diff = parseISO(b.expiryDate).getTime() - parseISO(a.expiryDate).getTime();
            if (diff !== 0) return diff;
        } else if (a.expiryDate) return -1; // a has expiry, b doesn't, so a is "later"
        else if (b.expiryDate) return 1;  // b has expiry, a doesn't
        // If expiry dates are same or both null, sort by uploadedAt
        return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
    });
    return docsOfType[0];
};


function generateAlertsForVehicle(vehicle: Vehicle) {
  // Clear existing non-read alerts for this user for this vehicle to avoid duplicates if docs change
  alerts = alerts.filter(a => !(a.vehicleId === vehicle.id && a.userId === MOCK_USER_ID && !a.isRead));

  // For each document record, if it's expiring or overdue, generate an alert.
  // This means a vehicle might have multiple alerts for the same document type if historical records are also overdue.
  vehicle.documents.forEach(doc => {
    const currentStatus = getDocumentComplianceStatus(doc.expiryDate);
    if ((currentStatus === 'ExpiringSoon' || currentStatus === 'Overdue') && doc.expiryDate) {
      // Check if a similar, unread alert already exists for this specific document instance
      const existingAlert = alerts.find(a => 
          a.vehicleId === vehicle.id && 
          a.documentType === doc.type && 
          (doc.type !== 'Other' || a.customDocumentTypeName === doc.customTypeName) &&
          a.dueDate === doc.expiryDate && // Tied to specific doc's due date
          a.userId === MOCK_USER_ID &&
          !a.isRead // Only prevent adding if an identical UNREAD alert exists
      );

      if (!existingAlert) {
          alerts.push({
            id: generateId(),
            vehicleId: vehicle.id,
            vehicleRegistration: vehicle.registrationNumber,
            documentType: doc.type,
            customDocumentTypeName: doc.customTypeName,
            dueDate: doc.expiryDate, // Alert is for this specific document's due date
            message: `${doc.type === 'Other' && doc.customTypeName ? doc.customTypeName : doc.type} for ${vehicle.registrationNumber} (Uploaded: ${format(parseISO(doc.uploadedAt), 'MMM dd, yyyy')}) is ${currentStatus === 'ExpiringSoon' ? `expiring on ${format(parseISO(doc.expiryDate), 'PPP')}` : `overdue since ${format(parseISO(doc.expiryDate), 'PPP')}`}.`,
            createdAt: formatISO(new Date()),
            isRead: false,
            userId: MOCK_USER_ID,
          } as Alert);
      }
    }
  });
}

function generateAllAlerts() {
  // Clear all non-read alerts for the MOCK_USER_ID before regenerating
  // This is a simplification; a real system might only update/remove alerts related to changed documents.
  alerts = alerts.filter(a => !(a.userId === MOCK_USER_ID && !a.isRead));
  vehicles.forEach(vehicle => generateAlertsForVehicle(vehicle));
}


export async function getAlerts(onlyUnread: boolean = false): Promise<Alert[]> {
  initializeDummyData(); 
  generateAllAlerts(); 
  let userAlerts = alerts.filter(a => a.userId === MOCK_USER_ID);
  if (onlyUnread) {
    userAlerts = userAlerts.filter(a => !a.isRead);
  }
  return JSON.parse(JSON.stringify(userAlerts.sort((a,b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime())));
}


export async function markAlertAsRead(alertId: string): Promise<boolean> {
  const alert = alerts.find(a => a.id === alertId && a.userId === MOCK_USER_ID);
  if (alert) {
    alert.isRead = true;
    internalLogAuditEvent('MARK_ALERT_READ', 'ALERT', alertId, { documentType: alert.documentType, vehicleRegistration: alert.vehicleRegistration });
    return true;
  }
  return false;
}

// Determines the overall compliance status of a vehicle considering all its document types.
// A vehicle is 'MissingInfo' if any required document type doesn't have at least one entry.
// Otherwise, its status is the "worst" status among its latest documents for each type.
export const getOverallVehicleCompliance = (vehicle: Vehicle): 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'MissingInfo' => {
  if (!vehicle.documents || vehicle.documents.length === 0) return 'MissingInfo';
  
  let overallStatus: 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'MissingInfo' = 'Compliant';
  let hasAtLeastOneMissingType = false;

  for (const docType of DOCUMENT_TYPES.filter(dt => dt !== 'Other')) { // Check standard types
    const latestDoc = getLatestDocumentForType(vehicle, docType);
    if (!latestDoc || latestDoc.status === 'Missing') { // No document of this type or latest is 'Missing'
      hasAtLeastOneMissingType = true;
      break; 
    }
    const status = latestDoc.status;
    if (status === 'Overdue') {
      overallStatus = 'Overdue';
      // Overdue is the worst, can break early if we want, but checking all helps find other issues.
    } else if (status === 'ExpiringSoon' && overallStatus !== 'Overdue') {
      overallStatus = 'ExpiringSoon';
    }
  }

  // Handle 'Other' documents - if any 'Other' doc exists, check its latest.
  // This logic might need refinement based on business rules for 'Other' docs.
  const otherDocs = vehicle.documents.filter(d => d.type === 'Other');
  const customOtherTypes = [...new Set(otherDocs.map(d => d.customTypeName).filter(Boolean))];
  for (const customType of customOtherTypes) {
    const latestCustomDoc = getLatestDocumentForType(vehicle, 'Other', customType);
    if(latestCustomDoc) { // Only consider if a custom doc type exists
        const status = latestCustomDoc.status;
        if (status === 'Overdue') {
            overallStatus = 'Overdue';
        } else if (status === 'ExpiringSoon' && overallStatus !== 'Overdue') {
            overallStatus = 'ExpiringSoon';
        } else if (status === 'Missing' && overallStatus !== 'Overdue' && overallStatus !== 'ExpiringSoon') {
            // If a defined 'Other' type is missing its document, it's missing info.
            hasAtLeastOneMissingType = true; 
        }
    }
  }


  if (hasAtLeastOneMissingType) return 'MissingInfo';
  return overallStatus;
};


export async function getSummaryStats(): Promise<SummaryStats> {
  initializeDummyData();
  const allVehicles = await getVehicles();
  
  const vehicleComplianceBreakdown: VehicleComplianceStatusBreakdown = {
    compliant: 0,
    expiringSoon: 0,
    overdue: 0,
    missingInfo: 0,
    total: allVehicles.length,
  };

  let expiringSoonDocumentsCount = 0;
  let overdueDocumentsCount = 0;
  // Specific document type counts - counts latest active documents
  const docTypeCounts = {
    expiring: {} as Record<DocumentType, number>,
    overdue: {} as Record<DocumentType, number>,
  };
  DOCUMENT_TYPES.forEach(dt => {
    docTypeCounts.expiring[dt] = 0;
    docTypeCounts.overdue[dt] = 0;
  });

  allVehicles.forEach(vehicle => {
    const overallVehicleStatus = getOverallVehicleCompliance(vehicle);
    switch(overallVehicleStatus) {
      case 'Compliant': vehicleComplianceBreakdown.compliant++; break;
      case 'ExpiringSoon': vehicleComplianceBreakdown.expiringSoon++; break;
      case 'Overdue': vehicleComplianceBreakdown.overdue++; break;
      case 'MissingInfo': vehicleComplianceBreakdown.missingInfo++; break;
    }
    
    // Count expiring/overdue for *latest active* documents of each type for summary cards
    DOCUMENT_TYPES.forEach(docType => {
        const latestDoc = getLatestDocumentForType(vehicle, docType);
        if (latestDoc) {
            if (latestDoc.status === 'ExpiringSoon') {
                expiringSoonDocumentsCount++;
                docTypeCounts.expiring[docType]++;
            } else if (latestDoc.status === 'Overdue') {
                overdueDocumentsCount++;
                docTypeCounts.overdue[docType]++;
            }
        }
    });
  });

  return {
    totalVehicles: allVehicles.length,
    compliantVehicles: vehicleComplianceBreakdown.compliant,
    expiringSoonDocuments: expiringSoonDocumentsCount,
    overdueDocuments: overdueDocumentsCount,
    expiringInsurance: docTypeCounts.expiring['Insurance'],
    overdueInsurance: docTypeCounts.overdue['Insurance'],
    expiringFitness: docTypeCounts.expiring['Fitness'],
    overdueFitness: docTypeCounts.overdue['Fitness'],
    expiringPUC: docTypeCounts.expiring['PUC'],
    overduePUC: docTypeCounts.overdue['PUC'],
    expiringAITP: docTypeCounts.expiring['AITP'],
    overdueAITP: docTypeCounts.overdue['AITP'],
    vehicleComplianceBreakdown
  };
}

// Reportable documents now lists ALL historical documents that match filters
export async function getReportableDocuments(
  filters?: { 
    statuses?: Array<'ExpiringSoon' | 'Overdue' | 'Compliant' | 'Missing'>, 
    documentTypes?: DocumentType[] 
  }
): Promise<ReportableDocument[]> {
  initializeDummyData();
  const allVehicles = await getVehicles(); 
  const reportableDocs: ReportableDocument[] = [];
  const now = new Date();
  now.setHours(0,0,0,0);

  allVehicles.forEach(vehicle => {
    vehicle.documents.forEach(doc => {
      // The status on doc is already calculated based on its own expiryDate
      const status = doc.status; 
      let daysDiff = 0;
      if (doc.expiryDate) {
        const expDate = parseISO(doc.expiryDate);
        expDate.setHours(23,59,59,999);
        daysDiff = differenceInDays(expDate, now);
      } else {
        daysDiff = -Infinity; 
      }

      let passesFilters = true;
      if (filters?.statuses && filters.statuses.length > 0 && !filters.statuses.includes(status)) {
        passesFilters = false;
      }
      if (filters?.documentTypes && filters.documentTypes.length > 0 && !filters.documentTypes.includes(doc.type)) {
        passesFilters = false;
      }
      
      if (passesFilters) { 
        reportableDocs.push({
            ...doc, // Spread the original document, status is already on it
            vehicleRegistration: vehicle.registrationNumber,
            daysDifference: daysDiff,
        });
      }
    });
  });
  return reportableDocs.sort((a, b) => {
    // Primary sort by daysDifference (ascending - overdue first, then expiring soon)
    const daysDiffCompare = a.daysDifference - b.daysDifference;
    if (daysDiffCompare !== 0) return daysDiffCompare;
    // Secondary sort by vehicle registration if daysDiff is same
    return a.vehicleRegistration.localeCompare(b.vehicleRegistration);
  });
}


export async function getCurrentUser(): Promise<User> {
  const role: UserRole = MOCK_USER_ID.includes('_admin') ? 'admin' : MOCK_USER_ID.includes('_manager') ? 'manager' : 'viewer';
  return {
    id: MOCK_USER_ID,
    name: role === 'admin' ? "Admin User" : role === 'manager' ? "Fleet Manager" : "Demo User",
    email: role === 'admin' ? "admin@example.com" : role === 'manager' ? "manager@example.com" : "user@example.com",
    avatarUrl: `https://placehold.co/100x100.png?text=${role === 'admin' ? 'AU' : role === 'manager' ? 'FM' : 'DU'}`,
    role: role
  };
}

export async function getAuditLogs(filters?: {
  userId?: string;
  entityType?: AuditLogEntry['entityType'];
  action?: AuditLogAction;
  dateFrom?: string; 
  dateTo?: string;   
}): Promise<AuditLogEntry[]> {
  initializeDummyData();
  let filteredLogs = [...auditLogs];

  if (filters?.userId) {
    filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
  }
  if (filters?.entityType) {
    filteredLogs = filteredLogs.filter(log => log.entityType === filters.entityType);
  }
  if (filters?.action) {
    filteredLogs = filteredLogs.filter(log => log.action === filters.action);
  }
  if (filters?.dateFrom) {
    const from = parseISO(filters.dateFrom);
    from.setHours(0,0,0,0);
    filteredLogs = filteredLogs.filter(log => !isBefore(parseISO(log.timestamp), from));
  }
  if (filters?.dateTo) {
    const to = parseISO(filters.dateTo);
    to.setHours(23, 59, 59, 999); 
    filteredLogs = filteredLogs.filter(log => !isBefore(to, parseISO(log.timestamp)));
  }
  
  return JSON.parse(JSON.stringify(filteredLogs.sort((a,b) => parseISO(b.timestamp).getTime() - parseISO(a.timestamp).getTime())));
}

// Exported Server Action for client components to call for logging CSV exports
export async function recordCsvExportAudit(reportName: string, formatUsed: string, filtersApplied: Record<string, any>) {
  internalLogAuditEvent('EXPORT_REPORT', 'REPORT', undefined, {
    reportName,
    format: formatUsed, 
    filtersApplied,
  });
}

initializeDummyData();

