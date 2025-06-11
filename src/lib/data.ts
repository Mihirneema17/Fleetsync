
import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, AuditLogEntry, AuditLogAction, DocumentType, UserRole, VehicleComplianceStatusBreakdown, ReportableDocument } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID, AI_SUPPORTED_DOCUMENT_TYPES, DATE_FORMAT, AUDIT_LOG_ACTIONS } from './constants';
import { format, formatISO, addDays, isBefore, parseISO, differenceInDays, isAfter } from 'date-fns';

// Moved generateId to the top
const generateId = () => Math.random().toString(36).substr(2, 9);

// Global in-memory store for mock data
declare global {
  // eslint-disable-next-line no-var
  var _initializedData: boolean | undefined;
  // eslint-disable-next-line no-var
  var _mockVehicles: Vehicle[];
  // eslint-disable-next-line no-var
  var _mockAlerts: Alert[];
  // eslint-disable-next-line no-var
  var _mockAuditLogs: AuditLogEntry[];
}

const getVehiclesStore = (): Vehicle[] => global._mockVehicles;
const getAlertsStore = (): Alert[] => global._mockAlerts;
const getAuditLogsStore = (): AuditLogEntry[] => global._mockAuditLogs;

const setVehiclesStore = (vehicles: Vehicle[]) => { global._mockVehicles = vehicles; };
const setAlertsStore = (alerts: Alert[]) => { global._mockAlerts = alerts; };
const setAuditLogsStore = (auditLogs: AuditLogEntry[]) => { global._mockAuditLogs = auditLogs; };

// Internal audit logging function defined after generateId
const internalLogAuditEvent = (
  action: AuditLogAction,
  entityType: AuditLogEntry['entityType'],
  entityId?: string,
  details: Record<string, any> = {},
  entityRegistration?: string
) => {
  const auditLogs = getAuditLogsStore();
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
  setAuditLogsStore(auditLogs);
};

// _performInitialization uses generateId and internalLogAuditEvent
function _performInitialization() {
  const today = new Date();
  const initialVehiclesData: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>[] = [
    { registrationNumber: 'MH12AB1234', type: 'Car', make: 'Toyota', model: 'Camry' },
    { registrationNumber: 'KA01CD5678', type: 'Truck', make: 'Volvo', model: 'FH' },
    { registrationNumber: 'DL03EF9012', type: 'Bus', make: 'Tata', model: 'Marcopolo' },
    { registrationNumber: 'TN07GH4567', type: 'Van', make: 'Force', model: 'Traveller' },
  ];

  let initializedVehicles = initialVehiclesData.map((v, vehicleIndex) => {
    const vehicleId = generateId();
    const createdAt = formatISO(addDays(today, - (vehicleIndex * 150 + Math.floor(Math.random() * 30)) ));
    const vehicleInstance: Vehicle = {
      ...v,
      id: vehicleId,
      createdAt,
      updatedAt: createdAt,
      documents: []
    };

    for (let yearOffset = -2; yearOffset <= 0; yearOffset++) {
        DOCUMENT_TYPES.forEach(docType => {
            if (docType === 'AITP' && v.type === 'Car' && yearOffset < 0) return;

            const baseDate = addDays(today, yearOffset * 365);
            let expiryDateValue: Date | null = null;
            let startDateValue: Date | null = null;

            if (yearOffset === 0) {
                const offset = Math.floor(Math.random() * 120) - 30;
                if (docType === 'AITP' && v.type === 'Car') expiryDateValue = null;
                else if (Math.random() < 0.1 && docType !== 'Insurance') expiryDateValue = null;
                else expiryDateValue = addDays(today, offset);
            } else {
                 expiryDateValue = addDays(baseDate, Math.floor(Math.random() * 365) + (Math.random() > 0.7 ? 0 : -30));
                 if (isAfter(expiryDateValue, addDays(today, -1))) {
                    expiryDateValue = addDays(today, - (Math.floor(Math.random()*100)+1));
                 }
            }

            if (expiryDateValue) {
                startDateValue = addDays(expiryDateValue, - (Math.floor(Math.random() * 300) + 60));
            }

            const docUploadedAt = expiryDateValue ? formatISO(addDays(expiryDateValue, -(Math.floor(Math.random() * 90) + 30))) : formatISO(addDays(baseDate, -Math.floor(Math.random() * 30)));
            const clientSideDocId = generateId();
            
            const mockDocumentName = expiryDateValue ? `${docType}_${v.registrationNumber}_${yearOffset === 0 ? 'current' : `hist_${Math.abs(yearOffset)}`}.pdf` : undefined;
            const mockDocumentUrl = mockDocumentName ? `/uploads/mock/vehicle_${vehicleId}/doc_${clientSideDocId}/${mockDocumentName}` : undefined;


            const useAiMock = AI_SUPPORTED_DOCUMENT_TYPES.includes(docType) && Math.random() > 0.4;
            const policyNumBase = `${docType.substring(0,3).toUpperCase()}-${vehicleIndex}${Math.floor(Math.random()*9000)+1000}`;
            const policyNum = (docType === 'Insurance' || docType === 'AITP') ? policyNumBase :
                              (docType === 'Fitness' || docType === 'PUC') ? `CERT-${vehicleIndex}${Math.floor(Math.random()*9000)+1000}` : null;

            const doc: VehicleDocument = {
              id: generateId(),
              vehicleId,
              type: docType,
              customTypeName: docType === 'Other' ? 'Permit ' + Math.floor(Math.random()*10) : undefined,
              policyNumber: policyNum,
              startDate: startDateValue ? formatISO(startDateValue, { representation: 'date' }) : null,
              expiryDate: expiryDateValue ? formatISO(expiryDateValue, { representation: 'date' }) : null,
              documentUrl: mockDocumentUrl,
              documentName: mockDocumentName,
              status: 'Missing', // Initialize with a default status, will be updated
              uploadedAt: docUploadedAt,
              aiExtractedPolicyNumber: useAiMock && policyNum ? (Math.random() > 0.2 ? policyNum : `AI-${policyNum.substring(3)}`) : null,
              aiPolicyNumberConfidence: useAiMock && policyNum ? Math.random() * 0.3 + 0.7 : null,
              aiExtractedStartDate: useAiMock && startDateValue ? formatISO(addDays(startDateValue, Math.floor(Math.random()*6)-3), {representation: 'date'}) : null,
              aiStartDateConfidence: useAiMock && startDateValue ? Math.random() * 0.3 + 0.7 : null,
              aiExtractedDate: useAiMock && expiryDateValue ? formatISO(addDays(expiryDateValue, Math.floor(Math.random()*6)-3), {representation: 'date'}) : null,
              aiConfidence: useAiMock && expiryDateValue ? Math.random() * 0.3 + 0.7 : null,
            };
            vehicleInstance.documents.push(doc);
      });
    }
    internalLogAuditEvent('CREATE_VEHICLE', 'VEHICLE', vehicleInstance.id, { registrationNumber: vehicleInstance.registrationNumber, make: vehicleInstance.make, model: vehicleInstance.model, type: vehicleInstance.type }, vehicleInstance.registrationNumber);
    return vehicleInstance;
  });

  setVehiclesStore(initializedVehicles);

  // Now, iterate through the fully populated vehicles to set document statuses correctly
  const currentVehicles = getVehiclesStore(); // Get a mutable copy
  currentVehicles.forEach(vehicle => {
    vehicle.documents.forEach(doc => {
      doc.status = getDocumentComplianceStatus(doc.expiryDate); // Calculate status now
    });
  });
  setVehiclesStore(currentVehicles); // Persist the updated statuses

  generateAllAlerts(); // Generate alerts AFTER vehicles and their documents are populated and statuses set
  internalLogAuditEvent('SYSTEM_DATA_INITIALIZED', 'SYSTEM', undefined, { message: 'Dummy data initialized' });
};

// Initialize global stores only once
if (typeof global._initializedData === 'undefined') {
  global._mockVehicles = [];
  global._mockAlerts = [];
  global._mockAuditLogs = [];
  _performInitialization(); // Call the actual initialization logic
  global._initializedData = true;
}


export const getDocumentComplianceStatus = (expiryDate: string | null): VehicleDocument['status'] => {
  if (!expiryDate || typeof expiryDate !== 'string' || expiryDate.trim() === '') return 'Missing';
  const now = new Date();
  const expDate = parseISO(expiryDate); 
  expDate.setHours(23, 59, 59, 999); 
  now.setHours(0,0,0,0); 

  if (isBefore(expDate, now)) return 'Overdue';
  if (differenceInDays(expDate, now) < EXPIRY_WARNING_DAYS) return 'ExpiringSoon';
  return 'Compliant';
};

export async function getVehicles(): Promise<Vehicle[]> {
  return JSON.parse(JSON.stringify(getVehiclesStore().sort((a,b) => a.registrationNumber.localeCompare(b.registrationNumber))));
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  const vehicle = getVehiclesStore().find(v => v.id === id);
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
  const currentVehicles = getVehiclesStore();
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
    if (docType !== 'Other') {
        const newDocPlaceholder: VehicleDocument = {
            id: generateId(),
            vehicleId: vehicleId,
            type: docType,
            policyNumber: null,
            startDate: null,
            expiryDate: null,
            status: 'Missing', 
            uploadedAt: nowISO,
            documentName: undefined,
            documentUrl: undefined,
        };
        newVehicle.documents.push(newDocPlaceholder);
    }
  });

  currentVehicles.push(newVehicle);
  setVehiclesStore(currentVehicles);
  internalLogAuditEvent('CREATE_VEHICLE', 'VEHICLE', newVehicle.id, { registrationNumber: newVehicle.registrationNumber, make: newVehicle.make, model: newVehicle.model, type: newVehicle.type }, newVehicle.registrationNumber);
  generateAlertsForVehicle(newVehicle);
  return JSON.parse(JSON.stringify(newVehicle));
}

export async function updateVehicle(id: string, updates: Partial<Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>>): Promise<Vehicle | undefined> {
  const currentVehicles = getVehiclesStore();
  const vehicleIndex = currentVehicles.findIndex(v => v.id === id);
  if (vehicleIndex === -1) return undefined;

  const oldVehicleData = { ...currentVehicles[vehicleIndex] };
  currentVehicles[vehicleIndex] = { ...currentVehicles[vehicleIndex], ...updates, updatedAt: formatISO(new Date()) };
  setVehiclesStore(currentVehicles);

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
    internalLogAuditEvent('UPDATE_VEHICLE', 'VEHICLE', id, { updates: changedFields }, currentVehicles[vehicleIndex].registrationNumber);
  }
  generateAlertsForVehicle(currentVehicles[vehicleIndex]);
  return JSON.parse(JSON.stringify(currentVehicles[vehicleIndex]));
}

export async function deleteVehicle(id: string): Promise<boolean> {
  let currentVehicles = getVehiclesStore();
  let currentAlerts = getAlertsStore();
  const vehicleIndex = currentVehicles.findIndex(v => v.id === id);
  if (vehicleIndex === -1) return false;

  const vehicleToDelete = currentVehicles[vehicleIndex];
  currentVehicles.splice(vehicleIndex, 1);
  setVehiclesStore(currentVehicles);
  currentAlerts = currentAlerts.filter(a => a.vehicleId !== id);
  setAlertsStore(currentAlerts);

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
    documentUrl?: string;
    aiExtractedPolicyNumber?: string | null;
    aiPolicyNumberConfidence?: number | null;
    aiExtractedStartDate?: string | null;
    aiStartDateConfidence?: number | null;
    aiExtractedDate?: string | null; 
    aiConfidence?: number | null;    
  }
): Promise<Vehicle | undefined> {
  const currentVehicles = getVehiclesStore();
  const vehicleIndex = currentVehicles.findIndex(v => v.id === vehicleId);
  if (vehicleIndex === -1) return undefined;

  const vehicle = currentVehicles[vehicleIndex];
  const newDocId = generateId();
  
  const status = getDocumentComplianceStatus(docData.expiryDate); 
  const uploadedAt = formatISO(new Date());

  const newDocument: VehicleDocument = {
    id: newDocId,
    vehicleId,
    type: docData.type,
    customTypeName: docData.customTypeName,
    policyNumber: docData.policyNumber,
    startDate: docData.startDate,
    expiryDate: docData.expiryDate, 
    documentUrl: docData.documentUrl,
    documentName: docData.documentName,
    status,
    uploadedAt,
    
    aiExtractedPolicyNumber: docData.aiExtractedPolicyNumber,
    aiPolicyNumberConfidence: docData.aiPolicyNumberConfidence,
    aiExtractedStartDate: docData.aiExtractedStartDate,
    aiStartDateConfidence: docData.aiStartDateConfidence,
    aiExtractedDate: docData.aiExtractedDate, 
    aiConfidence: docData.aiConfidence,       
  };

  vehicle.documents.push(newDocument);

  
  const missingPlaceholderIndex = vehicle.documents.findIndex(d =>
    d.type === newDocument.type &&
    (d.type !== 'Other' || d.customTypeName === newDocument.customTypeName) &&
    d.status === 'Missing' && !d.expiryDate && d.id !== newDocId
  );
  if (missingPlaceholderIndex > -1) {
    vehicle.documents.splice(missingPlaceholderIndex, 1);
  }

  currentVehicles[vehicleIndex].updatedAt = formatISO(new Date());
  setVehiclesStore(currentVehicles);

  internalLogAuditEvent('UPLOAD_DOCUMENT', 'DOCUMENT', newDocId, {
    vehicleId: vehicle.id,
    documentType: newDocument.type,
    customTypeName: newDocument.customTypeName,
    policyNumber: newDocument.policyNumber,
    startDate: newDocument.startDate,
    expiryDate: newDocument.expiryDate, 
    documentName: newDocument.documentName,
    
    aiExtractedPolicyNumber: newDocument.aiExtractedPolicyNumber,
    aiPolicyNumberConfidence: newDocument.aiPolicyNumberConfidence,
    aiExtractedStartDate: newDocument.aiExtractedStartDate,
    aiStartDateConfidence: newDocument.aiStartDateConfidence,
    aiExtractedExpiryDate: newDocument.aiExtractedDate, 
    aiExpiryDateConfidence: newDocument.aiConfidence, 
  }, vehicle.registrationNumber);

  generateAlertsForVehicle(vehicle);
  return JSON.parse(JSON.stringify(vehicle));
}

export const getLatestDocumentForType = (vehicle: Vehicle, docType: DocumentType, customTypeName?: string): VehicleDocument | undefined => {
  const docsOfType = vehicle.documents.filter(d =>
      d.type === docType &&
      (docType !== 'Other' || d.customTypeName === customTypeName) &&
      d.expiryDate 
  );
  if (docsOfType.length === 0) return undefined;

  docsOfType.sort((a, b) => {
      if (a.expiryDate && b.expiryDate) { 
           const expiryDiff = parseISO(b.expiryDate).getTime() - parseISO(a.expiryDate).getTime();
           if (expiryDiff !== 0) return expiryDiff;
      }
      return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
  });
  return docsOfType[0];
};

function generateAlertsForVehicle(vehicle: Vehicle) {
  let currentAlerts = getAlertsStore();
  currentAlerts = currentAlerts.filter(a => !(a.vehicleId === vehicle.id && a.userId === MOCK_USER_ID && !a.isRead));

  const uniqueDocTypesToConsider = new Set<string>();
  DOCUMENT_TYPES.forEach(dt => {
    if (dt === 'Other') {
      vehicle.documents
        .filter(d => d.type === 'Other' && d.customTypeName)
        .forEach(d => uniqueDocTypesToConsider.add(`Other:${d.customTypeName}`));
    } else {
       if (vehicle.documents.some(d => d.type === dt)) {
           uniqueDocTypesToConsider.add(dt);
       }
    }
  });

  uniqueDocTypesToConsider.forEach(typeKey => {
    let docType: DocumentType;
    let customTypeNameForLookup: string | undefined;

    if (typeKey.startsWith('Other:')) {
      docType = 'Other';
      customTypeNameForLookup = typeKey.substring(6);
    } else {
      docType = typeKey as DocumentType;
    }

    const latestDoc = getLatestDocumentForType(vehicle, docType, customTypeNameForLookup);

    if (latestDoc && latestDoc.expiryDate) { 
      const currentStatus = getDocumentComplianceStatus(latestDoc.expiryDate);
      if (currentStatus === 'ExpiringSoon' || currentStatus === 'Overdue') {
        const existingAlert = currentAlerts.find(a =>
            a.vehicleId === vehicle.id &&
            a.documentType === latestDoc.type &&
            (latestDoc.type !== 'Other' || a.customDocumentTypeName === latestDoc.customTypeName) &&
            a.dueDate === latestDoc.expiryDate && 
            a.policyNumber === latestDoc.policyNumber && 
            a.userId === MOCK_USER_ID &&
            !a.isRead
        );

        if (!existingAlert) {
            currentAlerts.push({
                id: generateId(),
                vehicleId: vehicle.id,
                vehicleRegistration: vehicle.registrationNumber,
                documentType: latestDoc.type,
                customDocumentTypeName: latestDoc.customTypeName,
                policyNumber: latestDoc.policyNumber,
                dueDate: latestDoc.expiryDate, 
                message: `${latestDoc.type === 'Other' && latestDoc.customTypeName ? latestDoc.customTypeName : latestDoc.type} (Policy: ${latestDoc.policyNumber || 'N/A'}, Uploaded: ${format(parseISO(latestDoc.uploadedAt), 'MMM dd, yyyy')}) for ${vehicle.registrationNumber} is ${currentStatus === 'ExpiringSoon' ? `expiring on ${format(parseISO(latestDoc.expiryDate!), 'PPP')}` : `overdue since ${format(parseISO(latestDoc.expiryDate!), 'PPP')}`}.`,
                createdAt: formatISO(new Date()),
                isRead: false,
                userId: MOCK_USER_ID,
            } as Alert);
        }
      }
    }
  });
  setAlertsStore(currentAlerts);
}

function generateAllAlerts() {
  let currentAlerts = getAlertsStore();
  currentAlerts = currentAlerts.filter(a => !(a.userId === MOCK_USER_ID && !a.isRead)); 
  setAlertsStore(currentAlerts); 

  const currentVehicles = getVehiclesStore();
  currentVehicles.forEach(vehicle => generateAlertsForVehicle(vehicle));
}

export async function getAlerts(onlyUnread: boolean = false): Promise<Alert[]> {
  let userAlerts = getAlertsStore().filter(a => a.userId === MOCK_USER_ID);
  if (onlyUnread) {
    userAlerts = userAlerts.filter(a => !a.isRead);
  }
  return JSON.parse(JSON.stringify(userAlerts.sort((a,b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime())));
}

export async function markAlertAsRead(alertId: string): Promise<boolean> {
  const currentAlerts = getAlertsStore();
  const alert = currentAlerts.find(a => a.id === alertId && a.userId === MOCK_USER_ID);
  if (alert) {
    alert.isRead = true;
    setAlertsStore(currentAlerts);
    internalLogAuditEvent('MARK_ALERT_READ', 'ALERT', alertId, { documentType: alert.documentType, vehicleRegistration: alert.vehicleRegistration });
    return true;
  }
  return false;
}

export const getOverallVehicleCompliance = (vehicle: Vehicle): 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'MissingInfo' => {
  let isOverdue = false;
  let isExpiringSoon = false;
  
  const uniqueDocTypesForStatusCheck = new Set<string>();
  DOCUMENT_TYPES.forEach(dt => {
    if (dt === 'Other') {
      vehicle.documents.filter(d => d.type === 'Other' && d.customTypeName).forEach(d => uniqueDocTypesForStatusCheck.add(`Other:${d.customTypeName}`));
    } else {
      if (vehicle.documents.some(d => d.type === dt)) { 
          uniqueDocTypesForStatusCheck.add(dt);
      }
    }
  });
  
  if (uniqueDocTypesForStatusCheck.size === 0 && (!vehicle.documents || vehicle.documents.length === 0)) {
    return 'MissingInfo'; 
  }

  for (const typeKey of Array.from(uniqueDocTypesForStatusCheck)) {
    const [docType, customTypeName] = typeKey.startsWith('Other:')
      ? ['Other' as DocumentType, typeKey.split(':')[1]]
      : [typeKey as DocumentType, undefined];

    const latestDoc = getLatestDocumentForType(vehicle, docType, customTypeName);

    if (latestDoc && latestDoc.expiryDate) { 
      const status = getDocumentComplianceStatus(latestDoc.expiryDate);
      if (status === 'Overdue') isOverdue = true;
      if (status === 'ExpiringSoon') isExpiringSoon = true;
    } else if (!latestDoc && docType !== 'AITP') { 
      if (['Insurance', 'Fitness', 'PUC'].includes(docType)) {
          return 'MissingInfo';
      }
    }
  }

  if (isOverdue) return 'Overdue';
  if (isExpiringSoon) return 'ExpiringSoon';

  const ESSENTIAL_DOC_TYPES: DocumentType[] = ['Insurance', 'Fitness', 'PUC'];
  for (const reqType of ESSENTIAL_DOC_TYPES) {
    if (vehicle.documents.some(d => d.type === reqType)) {
        const latestEssentialDoc = getLatestDocumentForType(vehicle, reqType);
        if (!latestEssentialDoc || !latestEssentialDoc.expiryDate) { 
          return 'MissingInfo';
        }
    }
  }
  
  return 'Compliant'; 
};

export async function getSummaryStats(): Promise<SummaryStats> {
  const allVehicles = getVehiclesStore(); 

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

    const uniqueActiveDocTypesInVehicle = new Set<string>();
     DOCUMENT_TYPES.forEach(dt => {
        if (dt === 'Other') {
            vehicle.documents.filter(d => d.type === 'Other' && d.customTypeName).forEach(d => uniqueActiveDocTypesInVehicle.add(`Other:${d.customTypeName}`));
        } else {
             if (vehicle.documents.some(d => d.type === dt)) { 
                 uniqueActiveDocTypesInVehicle.add(dt);
             }
        }
    });

    uniqueActiveDocTypesInVehicle.forEach(typeKey => {
        let docType: DocumentType;
        let customTypeName: string | undefined;
        if (typeKey.startsWith('Other:')) {
            docType = 'Other';
            customTypeName = typeKey.split(':')[1];
        } else {
            docType = typeKey as DocumentType;
        }
        const latestDoc = getLatestDocumentForType(vehicle, docType, customTypeName);
        if (latestDoc && latestDoc.expiryDate) { 
            const status = getDocumentComplianceStatus(latestDoc.expiryDate);
            if (status === 'ExpiringSoon') {
                expiringSoonDocumentsCount++;
                if (docTypeCounts.expiring[latestDoc.type] !== undefined) { 
                    docTypeCounts.expiring[latestDoc.type]++;
                }
            } else if (status === 'Overdue') {
                overdueDocumentsCount++;
                if (docTypeCounts.overdue[latestDoc.type] !== undefined) {
                    docTypeCounts.overdue[latestDoc.type]++;
                }
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
  const allVehicles = getVehiclesStore();
  const reportableDocs: ReportableDocument[] = [];
  const now = new Date();
  now.setHours(0,0,0,0);

  allVehicles.forEach(vehicle => {
    vehicle.documents.forEach(doc => {
      const status = doc.status || getDocumentComplianceStatus(doc.expiryDate);

      let daysDiff = -Infinity; 
      if (doc.expiryDate) {
        const expDate = parseISO(doc.expiryDate);
        expDate.setHours(23,59,59,999); 
        daysDiff = differenceInDays(expDate, now);
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
            status: status, 
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
  let filteredLogs = [...getAuditLogsStore()];

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
  internalLogAuditEvent('EXPORT_REPORT', 'REPORT', undefined, {
    reportName,
    format: formatUsed,
    filtersApplied,
  });
}

    