

import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, AuditLogEntry, AuditLogAction, DocumentType, ReportableDocument, UserRole, VehicleComplianceStatusBreakdown } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID, AI_SUPPORTED_DOCUMENT_TYPES, DATE_FORMAT } from './constants';
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
    for (let yearOffset = -2; yearOffset <= 0; yearOffset++) { 
        DOCUMENT_TYPES.forEach(docType => {
            if (docType === 'AITP' && v.type === 'Car' && yearOffset < 0) return;

            const baseDate = addDays(today, yearOffset * 365); 
            let expiryDateValue: Date | null = null;
            let startDateValue: Date | null = null;
            
            if (yearOffset === 0) { // Current year documents
                const offset = Math.floor(Math.random() * 120) - 30; // -30 to +90 days from today
                if (docType === 'AITP' && v.type === 'Car') expiryDateValue = null;
                else if (Math.random() < 0.1) expiryDateValue = null; 
                else expiryDateValue = addDays(today, offset);
            } else { // Historical documents
                 expiryDateValue = addDays(baseDate, Math.floor(Math.random() * 365) + (Math.random() > 0.7 ? 0 : -30));
                 if (isAfter(expiryDateValue, addDays(today, -1))) {
                    expiryDateValue = addDays(today, - (Math.floor(Math.random()*100)+1)); 
                 }
            }
            
            if (expiryDateValue) {
                startDateValue = addDays(expiryDateValue, - (Math.floor(Math.random() * 300) + 60)); // 60 to 360 days before expiry
            }

            const docUploadedAt = expiryDateValue ? formatISO(addDays(expiryDateValue, -(Math.floor(Math.random() * 90) + 30))) : formatISO(addDays(baseDate, -Math.floor(Math.random() * 30)));
            
            const useAiMock = AI_SUPPORTED_DOCUMENT_TYPES.includes(docType) && Math.random() > 0.4;
            const policyNum = docType === 'Insurance' ? `POL-${vehicleIndex}${Math.floor(Math.random()*9000)+1000}` : 
                              (docType === 'Fitness' || docType === 'PUC') ? `CERT-${vehicleIndex}${Math.floor(Math.random()*9000)+1000}` : null;

            const doc: VehicleDocument = {
              id: generateId(),
              vehicleId,
              type: docType,
              customTypeName: docType === 'Other' ? 'Permit ' + Math.floor(Math.random()*10) : undefined,
              policyNumber: policyNum,
              startDate: startDateValue ? formatISO(startDateValue, { representation: 'date' }) : null,
              expiryDate: expiryDateValue ? formatISO(expiryDateValue, { representation: 'date' }) : null,
              status: 'Missing', 
              uploadedAt: docUploadedAt,
              documentName: expiryDateValue ? `${docType}_${v.registrationNumber}_${yearOffset === 0 ? 'current' : `hist_${Math.abs(yearOffset)}`}.pdf` : undefined,
              documentUrl: expiryDateValue ? `/uploads/mock/${docType}_${v.registrationNumber}.pdf` : undefined, 
              
              aiExtractedPolicyNumber: useAiMock && policyNum ? (Math.random() > 0.2 ? policyNum : `AI-${policyNum.substring(3)}`) : null,
              aiPolicyNumberConfidence: useAiMock && policyNum ? Math.random() * 0.3 + 0.7 : null, // Confidence 0.7-1.0
              aiExtractedStartDate: useAiMock && startDateValue ? formatISO(addDays(startDateValue, Math.floor(Math.random()*6)-3), {representation: 'date'}) : null,
              aiStartDateConfidence: useAiMock && startDateValue ? Math.random() * 0.3 + 0.7 : null,
              aiExtractedDate: useAiMock && expiryDateValue ? formatISO(addDays(expiryDateValue, Math.floor(Math.random()*6)-3), {representation: 'date'}) : null,
              aiConfidence: useAiMock && expiryDateValue ? Math.random() * 0.3 + 0.7 : null,
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
    vehicle.documents.sort((a, b) => {
        if (a.type < b.type) return -1;
        if (a.type > b.type) return 1;
        if (a.uploadedAt && b.uploadedAt) {
            return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
        }
        return 0;
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
    documents: [], 
    createdAt: nowISO,
    updatedAt: nowISO,
  };
  DOCUMENT_TYPES.forEach(docType => {
    newVehicle.documents.push({
      id: generateId(),
      vehicleId: vehicleId,
      type: docType,
      customTypeName: docType === 'Other' ? 'Default Custom' : undefined,
      policyNumber: null,
      startDate: null,
      expiryDate: null,
      status: 'Missing',
      uploadedAt: nowISO, 
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


export async function addOrUpdateDocument(
  vehicleId: string,
  docData: { 
    type: DocumentType;
    customTypeName?: string;
    policyNumber?: string | null;
    startDate?: string | null;
    expiryDate: string | null;
    documentName?: string;
    aiExtractedPolicyNumber?: string | null;
    aiPolicyNumberConfidence?: number | null;
    aiExtractedStartDate?: string | null;
    aiStartDateConfidence?: number | null;
    aiExtractedDate?: string | null; // For expiry date
    aiConfidence?: number | null;    // For expiry date
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
    policyNumber: docData.policyNumber,
    startDate: docData.startDate,
    expiryDate: docData.expiryDate,
    documentUrl,
    documentName: docData.documentName,
    status,
    uploadedAt,
    aiExtractedPolicyNumber: docData.aiExtractedPolicyNumber,
    aiPolicyNumberConfidence: docData.aiPolicyNumberConfidence,
    aiExtractedStartDate: docData.aiExtractedStartDate,
    aiStartDateConfidence: docData.aiStartDateConfidence,
    aiExtractedDate: docData.aiExtractedDate, // For expiry date
    aiConfidence: docData.aiConfidence,       // For expiry date
  };

  vehicle.documents.push(newDocument);
  
  const missingPlaceholderIndex = vehicle.documents.findIndex(d => 
    d.type === newDocument.type && 
    (d.type !== 'Other' || d.customTypeName === newDocument.customTypeName) &&
    d.status === 'Missing' && d.id !== newDocId && !d.expiryDate 
  );
  if (missingPlaceholderIndex > -1) {
    vehicle.documents.splice(missingPlaceholderIndex, 1);
  }

  vehicles[vehicleIndex].updatedAt = formatISO(new Date()); 

  internalLogAuditEvent('UPLOAD_DOCUMENT', 'DOCUMENT', newDocId, { 
    documentType: docData.type,
    customTypeName: docData.customTypeName,
    policyNumber: docData.policyNumber,
    startDate: docData.startDate,
    expiryDate: docData.expiryDate,
    documentName: docData.documentName,
    aiExtractedPolicyNumber: docData.aiExtractedPolicyNumber,
    aiPolicyNumberConfidence: docData.aiPolicyNumberConfidence,
    aiExtractedStartDate: docData.aiExtractedStartDate,
    aiStartDateConfidence: docData.aiStartDateConfidence,
    aiExtractedExpiryDate: docData.aiExtractedDate,
    aiExpiryDateConfidence: docData.aiConfidence,
  }, vehicle.registrationNumber);

  generateAlertsForVehicle(vehicle); 
  return JSON.parse(JSON.stringify(vehicle));
}

const getLatestDocumentForType = (vehicle: Vehicle, docType: DocumentType, customTypeName?: string): VehicleDocument | undefined => {
    const docsOfType = vehicle.documents.filter(d => 
        d.type === docType && 
        (docType !== 'Other' || d.customTypeName === customTypeName) &&
        d.expiryDate // Only consider documents that have an expiry date for "latest active"
    );
    if (docsOfType.length === 0) return undefined;
    
    docsOfType.sort((a, b) => {
        // This sort prioritizes non-null expiry dates first, then sorts by date
        if (a.expiryDate && b.expiryDate) {
             const diff = parseISO(b.expiryDate).getTime() - parseISO(a.expiryDate).getTime();
             if (diff !== 0) return diff; // Sort by expiry date descending
        } else if (a.expiryDate) return -1; // a has expiry, b doesn't, so a is "later"
        else if (b.expiryDate) return 1;  // b has expiry, a doesn't
        // If expiry dates are same (or both null), sort by uploadedAt descending
        return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
    });
    return docsOfType[0]; // The first one is the latest active one
};


function generateAlertsForVehicle(vehicle: Vehicle) {
  alerts = alerts.filter(a => !(a.vehicleId === vehicle.id && a.userId === MOCK_USER_ID && !a.isRead));

  vehicle.documents.forEach(doc => {
    const currentStatus = getDocumentComplianceStatus(doc.expiryDate);
    if ((currentStatus === 'ExpiringSoon' || currentStatus === 'Overdue') && doc.expiryDate) {
      const existingAlert = alerts.find(a => 
          a.vehicleId === vehicle.id && 
          a.documentType === doc.type && 
          (doc.type !== 'Other' || a.customDocumentTypeName === doc.customTypeName) &&
          a.dueDate === doc.expiryDate && 
          a.userId === MOCK_USER_ID &&
          !a.isRead 
      );

      if (!existingAlert) {
          alerts.push({
            id: generateId(),
            vehicleId: vehicle.id,
            vehicleRegistration: vehicle.registrationNumber,
            documentType: doc.type,
            customDocumentTypeName: doc.customTypeName,
            dueDate: doc.expiryDate, 
            message: `${doc.type === 'Other' && doc.customTypeName ? doc.customTypeName : doc.type} for ${vehicle.registrationNumber} (Policy: ${doc.policyNumber || 'N/A'}, Uploaded: ${format(parseISO(doc.uploadedAt), 'MMM dd, yyyy')}) is ${currentStatus === 'ExpiringSoon' ? `expiring on ${format(parseISO(doc.expiryDate), 'PPP')}` : `overdue since ${format(parseISO(doc.expiryDate), 'PPP')}`}.`,
            createdAt: formatISO(new Date()),
            isRead: false,
            userId: MOCK_USER_ID,
          } as Alert);
      }
    }
  });
}

function generateAllAlerts() {
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

export const getOverallVehicleCompliance = (vehicle: Vehicle): 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'MissingInfo' => {
  if (!vehicle.documents || vehicle.documents.length === 0) return 'MissingInfo';
  
  let overallStatus: 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'MissingInfo' = 'Compliant';
  let hasAtLeastOneMissingActiveDocument = false;

  const relevantDocTypes = new Set<string>();
  DOCUMENT_TYPES.forEach(dt => relevantDocTypes.add(dt === 'Other' ? `Other:${dt}` : dt)); // Use a unique key for general 'Other'
  vehicle.documents.forEach(doc => {
      if (doc.type === 'Other' && doc.customTypeName) {
          relevantDocTypes.add(`Other:${doc.customTypeName}`);
      } else {
          relevantDocTypes.add(doc.type);
      }
  });


  for (const typeKey of Array.from(relevantDocTypes)) {
    let docType: DocumentType;
    let customTypeName: string | undefined;

    if (typeKey.startsWith('Other:')) {
        docType = 'Other';
        customTypeName = typeKey.split(':')[1];
        if (customTypeName === 'Other') customTypeName = undefined; // Handles the generic "Other" without custom name if any exists
    } else {
        docType = typeKey as DocumentType;
    }
    
    // Skip if it's the generic 'Other' type and we only want to process explicitly named 'Other' types or standard types
    if (docType === 'Other' && !customTypeName && !DOCUMENT_TYPES.includes('Other')) continue;


    const latestDoc = getLatestDocumentForType(vehicle, docType, customTypeName);
    
    if (!latestDoc || latestDoc.status === 'Missing') { 
      // This logic needs to be careful: a 'Missing' status for a *type* means no *active* document exists.
      // If all docs of a type are historical and expired, that type is effectively "Missing" for current compliance.
      // `getLatestDocumentForType` already filters for docs with expiry dates for "active" consideration.
      // If it returns undefined, it means no such active document was found.
      hasAtLeastOneMissingActiveDocument = true;
      break; 
    }
    const status = latestDoc.status; // Status of the latest *active* document
    if (status === 'Overdue') {
      overallStatus = 'Overdue';
    } else if (status === 'ExpiringSoon' && overallStatus !== 'Overdue') {
      overallStatus = 'ExpiringSoon';
    }
  }

  if (hasAtLeastOneMissingActiveDocument) return 'MissingInfo';
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
    
    // Iterate over unique document types present in the vehicle to count for summary cards
    const uniqueDocTypesInVehicle = new Map<string, VehicleDocument>();

    vehicle.documents.forEach(doc => {
        const typeKey = doc.type === 'Other' && doc.customTypeName ? `Other:${doc.customTypeName}` : doc.type;
        const latestForType = getLatestDocumentForType(vehicle, doc.type, doc.customTypeName);
        if (latestForType) {
            uniqueDocTypesInVehicle.set(typeKey, latestForType);
        }
    });


    uniqueDocTypesInVehicle.forEach(latestDoc => {
        if (latestDoc.status === 'ExpiringSoon') {
            expiringSoonDocumentsCount++;
            if (docTypeCounts.expiring[latestDoc.type] !== undefined) {
                 docTypeCounts.expiring[latestDoc.type]++;
            }
        } else if (latestDoc.status === 'Overdue') {
            overdueDocumentsCount++;
             if (docTypeCounts.overdue[latestDoc.type] !== undefined) {
                docTypeCounts.overdue[latestDoc.type]++;
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
            ...doc, 
            vehicleRegistration: vehicle.registrationNumber,
            daysDifference: daysDiff,
        });
      }
    });
  });
  return reportableDocs.sort((a, b) => {
    const daysDiffCompare = a.daysDifference - b.daysDifference;
    if (daysDiffCompare !== 0) return daysDiffCompare;
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

export async function recordCsvExportAudit(reportName: string, formatUsed: string, filtersApplied: Record<string, any>) {
  // 'use server'; // This directive should be at the top of the file if all functions are server actions, or in a separate actions.ts file.
                  // For a data utility file like this, it's usually not placed inline.
  internalLogAuditEvent('EXPORT_REPORT', 'REPORT', undefined, {
    reportName,
    format: formatUsed, 
    filtersApplied,
  });
}

initializeDummyData();
