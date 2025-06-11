
import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, AuditLogEntry, AuditLogAction, DocumentType, UserRole, VehicleComplianceStatusBreakdown, ReportableDocument } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID, AI_SUPPORTED_DOCUMENT_TYPES, DATE_FORMAT, AUDIT_LOG_ACTIONS } from './constants';
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
                else if (Math.random() < 0.1 && docType !== 'Insurance') expiryDateValue = null;
                else expiryDateValue = addDays(today, offset);
            } else { // Historical documents
                 expiryDateValue = addDays(baseDate, Math.floor(Math.random() * 365) + (Math.random() > 0.7 ? 0 : -30));
                 if (isAfter(expiryDateValue, addDays(today, -1))) {
                    expiryDateValue = addDays(today, - (Math.floor(Math.random()*100)+1));
                 }
            }

            if (expiryDateValue) {
                startDateValue = addDays(expiryDateValue, - (Math.floor(Math.random() * 300) + 60));
            }

            const docUploadedAt = expiryDateValue ? formatISO(addDays(expiryDateValue, -(Math.floor(Math.random() * 90) + 30))) : formatISO(addDays(baseDate, -Math.floor(Math.random() * 30)));

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
              documentUrl: expiryDateValue ? `/uploads/mock/vehicle_${vehicleId}/doc_${generateId()}/${docType}_${v.registrationNumber}.pdf` : undefined,
              documentName: expiryDateValue ? `${docType}_${v.registrationNumber}_${yearOffset === 0 ? 'current' : `hist_${Math.abs(yearOffset)}`}.pdf` : undefined,
              status: 'Missing', // Will be calculated
              uploadedAt: docUploadedAt,

              aiExtractedPolicyNumber: useAiMock && policyNum ? (Math.random() > 0.2 ? policyNum : `AI-${policyNum.substring(3)}`) : null,
              aiPolicyNumberConfidence: useAiMock && policyNum ? Math.random() * 0.3 + 0.7 : null,
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
  internalLogAuditEvent('SYSTEM_DATA_INITIALIZED', 'SYSTEM', undefined, { message: 'Dummy data initialized' });
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
  // Add placeholder "Missing" entries for standard document types
  DOCUMENT_TYPES.forEach(docType => {
    if (docType !== 'Other') {
        newVehicle.documents.push({
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
        });
    }
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
    documentUrl?: string;
    aiExtractedPolicyNumber?: string | null;
    aiPolicyNumberConfidence?: number | null;
    aiExtractedStartDate?: string | null;
    aiStartDateConfidence?: number | null;
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

  vehicles[vehicleIndex].updatedAt = formatISO(new Date());

  internalLogAuditEvent('UPLOAD_DOCUMENT', 'DOCUMENT', newDocId, {
    documentType: docData.type,
    customTypeName: docData.customTypeName,
    policyNumber: docData.policyNumber,
    startDate: docData.startDate,
    expiryDate: docData.expiryDate,
    documentName: docData.documentName,
    documentUrl: docData.documentUrl,
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

export const getLatestDocumentForType = (vehicle: Vehicle, docType: DocumentType, customTypeName?: string): VehicleDocument | undefined => {
    const docsOfType = vehicle.documents.filter(d =>
        d.type === docType &&
        (docType !== 'Other' || d.customTypeName === customTypeName) &&
        d.expiryDate // Only consider documents that have an expiry date as "latest active"
    );
    if (docsOfType.length === 0) return undefined;

    // Sort by expiry date descending, then by uploaded date descending as a tie-breaker
    docsOfType.sort((a, b) => {
        if (a.expiryDate && b.expiryDate) { // Should always be true due to filter above
             const expiryDiff = parseISO(b.expiryDate).getTime() - parseISO(a.expiryDate).getTime();
             if (expiryDiff !== 0) return expiryDiff;
        }
        // If expiry dates are the same (or one is null, though filtered out), sort by uploadedAt
        return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
    });
    return docsOfType[0];
};


function generateAlertsForVehicle(vehicle: Vehicle) {
  // Remove existing unread alerts for this user for this vehicle to avoid duplicates if re-generating
  alerts = alerts.filter(a => !(a.vehicleId === vehicle.id && a.userId === MOCK_USER_ID && !a.isRead));

  const uniqueDocTypesToConsider = new Set<string>();
  // Iterate over all document types defined in constants to ensure we check for them
  DOCUMENT_TYPES.forEach(dt => {
    if (dt === 'Other') {
      // For 'Other', get all unique custom type names present in the vehicle's documents
      vehicle.documents
        .filter(d => d.type === 'Other' && d.customTypeName)
        .forEach(d => uniqueDocTypesToConsider.add(`Other:${d.customTypeName}`));
    } else {
      // For standard types, just add the type if any document of this type exists for the vehicle.
      // This ensures we attempt to find the latest even if the only one is a placeholder.
      // However, alerts are only for *active* (expiryDate-having) latest docs.
       if (vehicle.documents.some(d => d.type === dt)) {
           uniqueDocTypesToConsider.add(dt);
       }
    }
  });


  uniqueDocTypesToConsider.forEach(typeKey => {
    let docType: DocumentType;
    let customTypeName: string | undefined;

    if (typeKey.startsWith('Other:')) {
      docType = 'Other';
      customTypeName = typeKey.substring(6);
    } else {
      docType = typeKey as DocumentType;
    }

    const latestDoc = getLatestDocumentForType(vehicle, docType, customTypeName);

    if (latestDoc && latestDoc.expiryDate) { // Only generate alerts for documents that have an expiry date
      const currentStatus = getDocumentComplianceStatus(latestDoc.expiryDate);
      if (currentStatus === 'ExpiringSoon' || currentStatus === 'Overdue') {
        // Check if an identical unread alert already exists for this specific document instance
        const existingAlert = alerts.find(a =>
            a.vehicleId === vehicle.id &&
            a.documentType === latestDoc.type &&
            (latestDoc.type !== 'Other' || a.customDocumentTypeName === latestDoc.customTypeName) &&
            a.dueDate === latestDoc.expiryDate && // Tied to this specific document's due date
            a.policyNumber === latestDoc.policyNumber && // And policy number
            a.userId === MOCK_USER_ID &&
            !a.isRead
        );

        if (!existingAlert) {
            alerts.push({
                id: generateId(),
                vehicleId: vehicle.id,
                vehicleRegistration: vehicle.registrationNumber,
                documentType: latestDoc.type,
                customDocumentTypeName: latestDoc.customDocumentTypeName,
                policyNumber: latestDoc.policyNumber,
                dueDate: latestDoc.expiryDate, // Due date is the expiry date of this specific document
                message: `${latestDoc.type === 'Other' && latestDoc.customDocumentTypeName ? latestDoc.customDocumentTypeName : latestDoc.type} (Policy: ${latestDoc.policyNumber || 'N/A'}, Uploaded: ${format(parseISO(latestDoc.uploadedAt), 'MMM dd, yyyy')}) for ${vehicle.registrationNumber} is ${currentStatus === 'ExpiringSoon' ? `expiring on ${format(parseISO(latestDoc.expiryDate!), 'PPP')}` : `overdue since ${format(parseISO(latestDoc.expiryDate!), 'PPP')}`}.`,
                createdAt: formatISO(new Date()),
                isRead: false,
                userId: MOCK_USER_ID,
            } as Alert);
        }
      }
    }
  });
}

function generateAllAlerts() {
  alerts = alerts.filter(a => !(a.userId === MOCK_USER_ID && !a.isRead)); // Clear existing unread for the mock user before regenerating all
  vehicles.forEach(vehicle => generateAlertsForVehicle(vehicle));
}


export async function getAlerts(onlyUnread: boolean = false): Promise<Alert[]> {
  initializeDummyData();
  generateAllAlerts(); // Ensure alerts are up-to-date with current document states
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
  let isOverdue = false;
  let isExpiringSoon = false;
  let hasAtLeastOneEssentialActiveDoc = false;

  const uniqueDocTypesForStatusCheck = new Set<string>();
  DOCUMENT_TYPES.forEach(dt => {
    if (dt === 'Other') {
      vehicle.documents.filter(d => d.type === 'Other' && d.customTypeName).forEach(d => uniqueDocTypesForStatusCheck.add(`Other:${d.customTypeName}`));
    } else {
      if (vehicle.documents.some(d => d.type === dt)) { // Only consider types if the vehicle has them
          uniqueDocTypesForStatusCheck.add(dt);
      }
    }
  });
  
  if (uniqueDocTypesForStatusCheck.size === 0 && (!vehicle.documents || vehicle.documents.length === 0)) {
    return 'MissingInfo'; // No documents and no distinct types means nothing to check
  }

  for (const typeKey of Array.from(uniqueDocTypesForStatusCheck)) {
    const [docType, customTypeName] = typeKey.startsWith('Other:')
      ? ['Other' as DocumentType, typeKey.split(':')[1]]
      : [typeKey as DocumentType, undefined];

    const latestDoc = getLatestDocumentForType(vehicle, docType, customTypeName);

    if (latestDoc && latestDoc.expiryDate) { // Only consider docs with expiry for active status
      const status = getDocumentComplianceStatus(latestDoc.expiryDate);
      if (status === 'Overdue') isOverdue = true;
      if (status === 'ExpiringSoon') isExpiringSoon = true;
    }
  }

  if (isOverdue) return 'Overdue';
  if (isExpiringSoon) return 'ExpiringSoon';

  // Check for missing essential documents only if not already Overdue or ExpiringSoon
  const ESSENTIAL_DOC_TYPES: DocumentType[] = ['Insurance', 'Fitness', 'PUC']; // AITP is not essential for "MissingInfo" status
  for (const reqType of ESSENTIAL_DOC_TYPES) {
    const latestEssentialDoc = getLatestDocumentForType(vehicle, reqType);
    if (!latestEssentialDoc || !latestEssentialDoc.expiryDate) { // If no latest doc, or latest has no expiry date
      return 'MissingInfo';
    }
    hasAtLeastOneEssentialActiveDoc = true; // If we found at least one essential doc with an expiry date.
  }
  
  // If we reach here, and there were no essential types to begin with (e.g. only "Other" docs),
  // and those "Other" docs were compliant, then the vehicle is compliant.
  // If there *were* essential types and all were found and compliant, it's also compliant.
  // If no essential types were present AND no other types were present (already handled by uniqueDocTypesForStatusCheck.size === 0), it's MissingInfo.
  // This logic implies: if a vehicle ONLY has "Other" documents and they are all compliant, the vehicle is compliant.
  // If it has NO documents at all, it's MissingInfo.

  if (!hasAtLeastOneEssentialActiveDoc && uniqueDocTypesForStatusCheck.size > 0) {
    // This means the vehicle only has 'Other' docs or non-essential docs, and they were not overdue/expiring. So, compliant.
    return 'Compliant';
  }
  if (!hasAtLeastOneEssentialActiveDoc && uniqueDocTypesForStatusCheck.size === 0) {
    // No documents at all means MissingInfo
    return 'MissingInfo';
  }


  return 'Compliant'; // If not Overdue, ExpiringSoon, and all essentials are present and active
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
        if (latestDoc && latestDoc.expiryDate) { // Only count for summary if it has an expiry
            const status = getDocumentComplianceStatus(latestDoc.expiryDate);
            if (status === 'ExpiringSoon') {
                expiringSoonDocumentsCount++;
                if (docTypeCounts.expiring[latestDoc.type] !== undefined) { // latestDoc.type will be the base type ('Insurance', 'Other', etc.)
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
  initializeDummyData();
  const allVehicles = await getVehicles();
  const reportableDocs: ReportableDocument[] = [];
  const now = new Date();
  now.setHours(0,0,0,0);

  allVehicles.forEach(vehicle => {
    vehicle.documents.forEach(doc => {
      // For reports, we still use the raw status of each document instance
      const status = doc.expiryDate ? getDocumentComplianceStatus(doc.expiryDate) : 'Missing';

      let daysDiff = -Infinity; // Default for docs without expiry or if calculation is skipped
      if (doc.expiryDate) {
        const expDate = parseISO(doc.expiryDate);
        expDate.setHours(23,59,59,999); // Ensure comparison includes the whole expiry day
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
            status: status, // Use the raw status for reporting each historical instance
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

// Exported Server Action for client components to call for logging CSV exports
export async function recordCsvExportAudit(reportName: string, formatUsed: string, filtersApplied: Record<string, any>) {
  internalLogAuditEvent('EXPORT_REPORT', 'REPORT', undefined, {
    reportName,
    format: formatUsed,
    filtersApplied,
  });
}

initializeDummyData();

    
