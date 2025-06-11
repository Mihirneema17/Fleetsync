
import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, AuditLogEntry, AuditLogAction, DocumentType, UserRole, VehicleComplianceStatusBreakdown, ReportableDocument } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID, AI_SUPPORTED_DOCUMENT_TYPES, DATE_FORMAT, AUDIT_LOG_ACTIONS } from './constants';
import { format, formatISO, addDays, isBefore, parseISO, differenceInDays, isAfter } from 'date-fns';

// Helper function definitions first
const generateId = () => Math.random().toString(36).substr(2, 9);

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
      // If expiry dates are the same or one is null, sort by uploadedAt descending
      return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
  });
  return docsOfType[0];
};

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

// Global in-memory store accessors
const getVehiclesStore = (): Vehicle[] => global._mockVehicles;
const getAlertsStore = (): Alert[] => global._mockAlerts;
const getAuditLogsStore = (): AuditLogEntry[] => global._mockAuditLogs;

const setVehiclesStore = (vehicles: Vehicle[]) => { global._mockVehicles = vehicles; };
const setAlertsStore = (alerts: Alert[]) => { global._mockAlerts = alerts; };
const setAuditLogsStore = (auditLogs: AuditLogEntry[]) => { global._mockAuditLogs = auditLogs; };


function generateAlertsForVehicle(vehicle: Vehicle) {
  let currentAlerts = getAlertsStore();
  // Remove existing unread alerts for this user and vehicle to avoid duplicates if this is called multiple times
  currentAlerts = currentAlerts.filter(a => !(a.vehicleId === vehicle.id && a.userId === MOCK_USER_ID && !a.isRead));

  const uniqueDocTypesToConsider = new Set<string>();
  DOCUMENT_TYPES.forEach(dt => {
    if (dt === 'Other') {
      vehicle.documents
        .filter(d => d.type === 'Other' && d.customTypeName)
        .forEach(d => uniqueDocTypesToConsider.add(`Other:${d.customTypeName}`));
    } else {
       // Only consider base types if there's at least one document of that type (even if it's missing an expiry)
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

    if (latestDoc && latestDoc.expiryDate) { // Ensure there's an expiry date to check
      const currentStatus = getDocumentComplianceStatus(latestDoc.expiryDate);
      if (currentStatus === 'ExpiringSoon' || currentStatus === 'Overdue') {
        // Check if a similar unread alert already exists
        const existingAlert = currentAlerts.find(a =>
            a.vehicleId === vehicle.id &&
            a.documentType === latestDoc.type &&
            (latestDoc.type !== 'Other' || a.customDocumentTypeName === latestDoc.customTypeName) &&
            a.dueDate === latestDoc.expiryDate && // Compare exact due date
            a.policyNumber === latestDoc.policyNumber && // Compare policy number
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
                dueDate: latestDoc.expiryDate, // This is already an ISO date string
                message: `${latestDoc.type === 'Other' && latestDoc.customTypeName ? latestDoc.customTypeName : latestDoc.type} (Policy: ${latestDoc.policyNumber || 'N/A'}, Uploaded: ${format(parseISO(latestDoc.uploadedAt), 'MMM dd, yyyy')}) for ${vehicle.registrationNumber} is ${currentStatus === 'ExpiringSoon' ? `expiring on ${format(parseISO(latestDoc.expiryDate!), 'PPP')}` : `overdue since ${format(parseISO(latestDoc.expiryDate!), 'PPP')}`}.`,
                createdAt: formatISO(new Date()),
                isRead: false,
                userId: MOCK_USER_ID, // Associate with the mock user
            } as Alert); // Type assertion for clarity
        }
      }
    }
  });
  setAlertsStore(currentAlerts);
}

function generateAllAlerts() {
  let currentAlerts = getAlertsStore();
  // Clear only unread alerts for the mock user to avoid affecting other potential users if system grows
  currentAlerts = currentAlerts.filter(a => !(a.userId === MOCK_USER_ID && !a.isRead));
  setAlertsStore(currentAlerts); // Save the filtered list

  const currentVehicles = getVehiclesStore();
  currentVehicles.forEach(vehicle => generateAlertsForVehicle(vehicle));
}

// This function contains the core logic for populating the mock data.
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

    // Create historical and current documents
    for (let yearOffset = -2; yearOffset <= 0; yearOffset++) { // Create 2 past years and current year docs
        DOCUMENT_TYPES.forEach(docType => {
            // Skip AITP for Cars in historical data to make it less cluttered
            if (docType === 'AITP' && v.type === 'Car' && yearOffset < 0) return;

            const baseDate = addDays(today, yearOffset * 365); // Base for this year's docs
            let expiryDateValue: Date | null = null;
            let startDateValue: Date | null = null;

            // For current year, make some docs current, some expiring, some overdue
            if (yearOffset === 0) { // Current year documents
                const offset = Math.floor(Math.random() * 120) - 30; // -30 to +90 days from today
                if (docType === 'AITP' && v.type === 'Car') expiryDateValue = null; // AITP might not be applicable for all cars or is very new
                else if (Math.random() < 0.1 && docType !== 'Insurance') expiryDateValue = null; // 10% chance of missing expiry for non-insurance
                else expiryDateValue = addDays(today, offset);
            } else { // Historical documents (guaranteed to be expired relative to 'today')
                 expiryDateValue = addDays(baseDate, Math.floor(Math.random() * 365) + (Math.random() > 0.7 ? 0 : -30)); // Expire sometime within their year, or slightly before next
                 // Ensure historical expiry is actually in the past relative to 'today'
                 if (isAfter(expiryDateValue, addDays(today, -1))) { // If it accidentally went beyond yesterday
                    expiryDateValue = addDays(today, - (Math.floor(Math.random()*100)+1)); // Make it definitely expired
                 }
            }

            if (expiryDateValue) {
                startDateValue = addDays(expiryDateValue, - (Math.floor(Math.random() * 300) + 60)); // Start date 60-360 days before expiry
            }

            const docUploadedAt = expiryDateValue ? formatISO(addDays(expiryDateValue, -(Math.floor(Math.random() * 90) + 30))) : formatISO(addDays(baseDate, -Math.floor(Math.random() * 30)));
            const clientSideDocId = generateId(); // For mock URL generation
            
            const mockDocumentName = expiryDateValue ? `${docType}_${v.registrationNumber}_${yearOffset === 0 ? 'current' : `hist_${Math.abs(yearOffset)}`}.pdf` : undefined;
            const mockDocumentUrl = mockDocumentName ? `/uploads/mock/vehicle_${vehicleId}/doc_${clientSideDocId}/${mockDocumentName}` : undefined;


            // Simulate AI extraction for some documents
            const useAiMock = AI_SUPPORTED_DOCUMENT_TYPES.includes(docType) && Math.random() > 0.4; // 40% chance for supported types
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
              status: 'Missing', // Initial status, will be calculated later
              uploadedAt: docUploadedAt,
              // AI fields
              aiExtractedPolicyNumber: useAiMock && policyNum ? (Math.random() > 0.2 ? policyNum : `AI-${policyNum.substring(3)}`) : null,
              aiPolicyNumberConfidence: useAiMock && policyNum ? Math.random() * 0.3 + 0.7 : null, // Confidence 0.7-1.0
              aiExtractedStartDate: useAiMock && startDateValue ? formatISO(addDays(startDateValue, Math.floor(Math.random()*6)-3), {representation: 'date'}) : null, // AI date slightly off
              aiStartDateConfidence: useAiMock && startDateValue ? Math.random() * 0.3 + 0.7 : null,
              aiExtractedDate: useAiMock && expiryDateValue ? formatISO(addDays(expiryDateValue, Math.floor(Math.random()*6)-3), {representation: 'date'}) : null, // AI date slightly off
              aiConfidence: useAiMock && expiryDateValue ? Math.random() * 0.3 + 0.7 : null, // Confidence 0.7-1.0
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
}

// Global variable declarations for mock data stores
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

// Ensure data is initialized only once at the module level
if (typeof global._initializedData === 'undefined') {
  global._mockVehicles = [];
  global._mockAlerts = [];
  global._mockAuditLogs = [];
  _performInitialization(); // Call the main initialization logic
  global._initializedData = true;
}


// Public API functions
export async function getVehicles(): Promise<Vehicle[]> {
  return JSON.parse(JSON.stringify(getVehiclesStore().sort((a,b) => a.registrationNumber.localeCompare(b.registrationNumber))));
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  const vehicle = getVehiclesStore().find(v => v.id === id);
  if (vehicle) {
    // Ensure documents are sorted consistently, e.g., by type then by uploaded date (most recent first)
    vehicle.documents.sort((a, b) => {
        if (a.type < b.type) return -1;
        if (a.type > b.type) return 1;
        // For 'Other' type, consider customTypeName if present
        if (a.type === 'Other' && b.type === 'Other') {
            const nameA = a.customTypeName || '';
            const nameB = b.customTypeName || '';
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
        }
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
    documents: [], // Start with no documents, they'll be added if needed
    createdAt: nowISO,
    updatedAt: nowISO,
  };
  // Add 'Missing' placeholders for standard document types
  DOCUMENT_TYPES.forEach(docType => {
    if (docType !== 'Other') { // 'Other' types are added explicitly with custom names
        const newDocPlaceholder: VehicleDocument = {
            id: generateId(),
            vehicleId: vehicleId,
            type: docType,
            policyNumber: null,
            startDate: null,
            expiryDate: null, // No expiry date for a missing placeholder
            status: 'Missing', // Explicitly 'Missing'
            uploadedAt: nowISO, // Use current time for placeholder creation
            documentName: undefined,
            documentUrl: undefined,
            // AI fields would be null/undefined for a placeholder
        };
        newVehicle.documents.push(newDocPlaceholder);
    }
  });

  currentVehicles.push(newVehicle);
  setVehiclesStore(currentVehicles);
  internalLogAuditEvent('CREATE_VEHICLE', 'VEHICLE', newVehicle.id, { registrationNumber: newVehicle.registrationNumber, make: newVehicle.make, model: newVehicle.model, type: newVehicle.type }, newVehicle.registrationNumber);
  generateAlertsForVehicle(newVehicle); // Generate alerts for the new vehicle (will likely be 'Missing' alerts)
  return JSON.parse(JSON.stringify(newVehicle));
}

export async function updateVehicle(id: string, updates: Partial<Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>>): Promise<Vehicle | undefined> {
  const currentVehicles = getVehiclesStore();
  const vehicleIndex = currentVehicles.findIndex(v => v.id === id);
  if (vehicleIndex === -1) return undefined;

  const oldVehicleData = { ...currentVehicles[vehicleIndex] };
  currentVehicles[vehicleIndex] = { ...currentVehicles[vehicleIndex], ...updates, updatedAt: formatISO(new Date()) };
  setVehiclesStore(currentVehicles);

  // Log only changed fields
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
  generateAlertsForVehicle(currentVehicles[vehicleIndex]); // Re-evaluate alerts after update
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
  // Also remove associated alerts
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
    startDate?: string | null; // ISO string
    expiryDate: string | null; // ISO string
    documentName?: string; // Filename
    documentUrl?: string;  // Mock URL
    // AI fields
    aiExtractedPolicyNumber?: string | null;
    aiPolicyNumberConfidence?: number | null;
    aiExtractedStartDate?: string | null;
    aiStartDateConfidence?: number | null;
    aiExtractedDate?: string | null; // This is for expiryDate
    aiConfidence?: number | null;    // This is for expiryDateConfidence
  }
): Promise<Vehicle | undefined> {
  const currentVehicles = getVehiclesStore();
  const vehicleIndex = currentVehicles.findIndex(v => v.id === vehicleId);
  if (vehicleIndex === -1) return undefined;

  const vehicle = currentVehicles[vehicleIndex];
  const newDocId = generateId();
  // If an expiry date is provided, calculate status, otherwise it's 'Missing'
  const status = getDocumentComplianceStatus(docData.expiryDate); // Use the provided expiry date
  const uploadedAt = formatISO(new Date());

  const newDocument: VehicleDocument = {
    id: newDocId,
    vehicleId,
    type: docData.type,
    customTypeName: docData.customTypeName,
    policyNumber: docData.policyNumber,
    startDate: docData.startDate,
    expiryDate: docData.expiryDate, // Use provided expiry date
    documentUrl: docData.documentUrl,
    documentName: docData.documentName,
    status,
    uploadedAt,
    // Store AI fields
    aiExtractedPolicyNumber: docData.aiExtractedPolicyNumber,
    aiPolicyNumberConfidence: docData.aiPolicyNumberConfidence,
    aiExtractedStartDate: docData.aiExtractedStartDate,
    aiStartDateConfidence: docData.aiStartDateConfidence,
    aiExtractedDate: docData.aiExtractedDate, // This is for expiryDate from AI
    aiConfidence: docData.aiConfidence,       // This is for expiryDateConfidence from AI
  };

  vehicle.documents.push(newDocument);

  // Remove the 'Missing' placeholder if this new document effectively replaces it
  // This condition needs to be specific: only remove if the new doc has an expiry date
  // and matches the type (and customTypeName if 'Other').
  if (newDocument.expiryDate) {
      const missingPlaceholderIndex = vehicle.documents.findIndex(d =>
        d.type === newDocument.type &&
        (d.type !== 'Other' || d.customTypeName === newDocument.customTypeName) &&
        d.status === 'Missing' && !d.expiryDate && d.id !== newDocId // ensure not removing self and it's a true placeholder
      );
      if (missingPlaceholderIndex > -1) {
        vehicle.documents.splice(missingPlaceholderIndex, 1);
      }
  }


  currentVehicles[vehicleIndex].updatedAt = formatISO(new Date());
  setVehiclesStore(currentVehicles);

  internalLogAuditEvent('UPLOAD_DOCUMENT', 'DOCUMENT', newDocId, {
    vehicleId: vehicle.id,
    documentType: newDocument.type,
    customTypeName: newDocument.customTypeName,
    policyNumber: newDocument.policyNumber,
    startDate: newDocument.startDate,
    expiryDate: newDocument.expiryDate, // Log the final expiry date
    documentName: newDocument.documentName,
    // Log AI fields as well
    aiExtractedPolicyNumber: newDocument.aiExtractedPolicyNumber,
    aiPolicyNumberConfidence: newDocument.aiPolicyNumberConfidence,
    aiExtractedStartDate: newDocument.aiExtractedStartDate,
    aiStartDateConfidence: newDocument.aiStartDateConfidence,
    aiExtractedExpiryDate: newDocument.aiExtractedDate, // AI's view of expiry
    aiExpiryDateConfidence: newDocument.aiConfidence, // AI's confidence in expiry
  }, vehicle.registrationNumber);

  generateAlertsForVehicle(vehicle); // Re-generate alerts for this vehicle
  return JSON.parse(JSON.stringify(vehicle));
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
  // A vehicle is 'MissingInfo' if any essential document type doesn't have a latest active version.
  // Essential types: Insurance, Fitness, PUC. AITP is optional.
  const ESSENTIAL_DOC_TYPES: DocumentType[] = ['Insurance', 'Fitness', 'PUC'];
  let hasAllEssentialsWithExpiry = true;

  for (const essentialType of ESSENTIAL_DOC_TYPES) {
      const latestEssentialDoc = getLatestDocumentForType(vehicle, essentialType);
      if (!latestEssentialDoc || !latestEssentialDoc.expiryDate) {
          hasAllEssentialsWithExpiry = false;
          break;
      }
  }
  if (!hasAllEssentialsWithExpiry) {
      // If any essential document type is completely missing or lacks an expiry date, it's MissingInfo.
      // Exception: If there are NO documents at all, it's also MissingInfo.
      if (vehicle.documents.filter(d => d.type !== 'Other' && d.expiryDate).length === 0) {
          return 'MissingInfo';
      }
  }


  // Determine status based on active documents (those with expiry dates)
  const uniqueDocTypesForStatusCheck = new Set<string>();
  DOCUMENT_TYPES.forEach(dt => {
    if (dt === 'Other') {
      vehicle.documents.filter(d => d.type === 'Other' && d.customTypeName && d.expiryDate).forEach(d => uniqueDocTypesForStatusCheck.add(`Other:${d.customTypeName}`));
    } else {
      if (vehicle.documents.some(d => d.type === dt && d.expiryDate)) { // Only consider if there's an active doc
          uniqueDocTypesForStatusCheck.add(dt);
      }
    }
  });

  // If after filtering for active documents, there are none to check, but we didn't already flag as MissingInfo for essentials,
  // it might be compliant (e.g. only AITP exists and is compliant).
  // However, the check for essentials above should largely cover this.
  // The most important part is that if there ARE active documents, their statuses determine Overdue/ExpiringSoon.

  for (const typeKey of Array.from(uniqueDocTypesForStatusCheck)) {
    const [docType, customTypeName] = typeKey.startsWith('Other:')
      ? ['Other' as DocumentType, typeKey.split(':')[1]]
      : [typeKey as DocumentType, undefined];

    const latestDoc = getLatestDocumentForType(vehicle, docType, customTypeName); // This will only return docs with expiry

    if (latestDoc && latestDoc.expiryDate) { // Redundant check, but safe
      const status = getDocumentComplianceStatus(latestDoc.expiryDate);
      if (status === 'Overdue') isOverdue = true;
      if (status === 'ExpiringSoon') isExpiringSoon = true;
    }
    // No need for 'Missing' here as getLatestDocumentForType only returns those with expiry dates
  }

  if (isOverdue) return 'Overdue';
  if (isExpiringSoon) return 'ExpiringSoon';
  // If not Overdue or ExpiringSoon, and we passed the essential document check, it's Compliant.
  // If we got here and it's not Overdue/Expiring, but didn't pass the initial essential check, it implies MissingInfo.
  if (!hasAllEssentialsWithExpiry && vehicle.documents.filter(d => ESSENTIAL_DOC_TYPES.includes(d.type) && d.expiryDate).length < ESSENTIAL_DOC_TYPES.length) {
      return 'MissingInfo';
  }

  return 'Compliant'; // Default to compliant if no issues found and essentials are covered
};

export async function getSummaryStats(): Promise<SummaryStats> {
  const allVehicles = getVehiclesStore(); // This will also ensure data is initialized due to top-level call

  const vehicleComplianceBreakdown: VehicleComplianceStatusBreakdown = {
    compliant: 0,
    expiringSoon: 0,
    overdue: 0,
    missingInfo: 0,
    total: allVehicles.length,
  };

  let expiringSoonDocumentsCount = 0;
  let overdueDocumentsCount = 0;
  // Initialize counts for each document type
  const docTypeCounts = {
    expiring: {} as Record<DocumentType | 'OtherCustom', number>, // Use a common key for 'Other'
    overdue: {} as Record<DocumentType | 'OtherCustom', number>,
  };
  DOCUMENT_TYPES.forEach(dt => {
    docTypeCounts.expiring[dt] = 0;
    docTypeCounts.overdue[dt] = 0;
  });
  docTypeCounts.expiring['OtherCustom'] = 0; // For all 'Other' types combined
  docTypeCounts.overdue['OtherCustom'] = 0;

  allVehicles.forEach(vehicle => {
    const overallVehicleStatus = getOverallVehicleCompliance(vehicle);
    switch(overallVehicleStatus) {
      case 'Compliant': vehicleComplianceBreakdown.compliant++; break;
      case 'ExpiringSoon': vehicleComplianceBreakdown.expiringSoon++; break;
      case 'Overdue': vehicleComplianceBreakdown.overdue++; break;
      case 'MissingInfo': vehicleComplianceBreakdown.missingInfo++; break;
    }

    // Iterate over all document types to count expiring/overdue for active documents
    const uniqueActiveDocTypesInVehicle = new Set<string>();
     DOCUMENT_TYPES.forEach(dt => {
        if (dt === 'Other') {
            // For 'Other', consider each custom type as distinct for getting latest, but aggregate for summary
            vehicle.documents.filter(d => d.type === 'Other' && d.customTypeName && d.expiryDate)
                             .forEach(d => uniqueActiveDocTypesInVehicle.add(`Other:${d.customTypeName}`));
        } else {
             if (vehicle.documents.some(d => d.type === dt && d.expiryDate)) { // Ensure active doc for this type
                 uniqueActiveDocTypesInVehicle.add(dt);
             }
        }
    });

    uniqueActiveDocTypesInVehicle.forEach(typeKey => {
        let docTypeForLookup: DocumentType;
        let customTypeNameForLookup: string | undefined;
        if (typeKey.startsWith('Other:')) {
            docTypeForLookup = 'Other';
            customTypeNameForLookup = typeKey.split(':')[1];
        } else {
            docTypeForLookup = typeKey as DocumentType;
        }
        const latestDoc = getLatestDocumentForType(vehicle, docTypeForLookup, customTypeNameForLookup);
        if (latestDoc && latestDoc.expiryDate) { // Should always be true due to how uniqueActiveDocTypesInVehicle is built
            const status = getDocumentComplianceStatus(latestDoc.expiryDate);
            const countKey = latestDoc.type === 'Other' ? 'OtherCustom' : latestDoc.type;

            if (status === 'ExpiringSoon') {
                expiringSoonDocumentsCount++;
                if (docTypeCounts.expiring[countKey] !== undefined) {
                    docTypeCounts.expiring[countKey]++;
                }
            } else if (status === 'Overdue') {
                overdueDocumentsCount++;
                if (docTypeCounts.overdue[countKey] !== undefined) {
                    docTypeCounts.overdue[countKey]++;
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
    // Note: 'Other' types are aggregated into expiringSoonDocuments/overdueDocuments
    // but not broken down further by custom type in this SummaryStats structure.
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
    // Create a map to hold the latest active document for each type/customTypeName
    const latestActiveDocsMap = new Map<string, VehicleDocument>();

    vehicle.documents.forEach(doc => {
      if (doc.expiryDate) { // Only consider documents with an expiry date as "active" for reporting latest
        const typeKey = doc.type === 'Other' && doc.customTypeName ? `Other:${doc.customTypeName}` : doc.type;
        const existingLatest = latestActiveDocsMap.get(typeKey);
        if (!existingLatest || parseISO(doc.expiryDate) > parseISO(existingLatest.expiryDate) || 
            (parseISO(doc.expiryDate).getTime() === parseISO(existingLatest.expiryDate).getTime() && parseISO(doc.uploadedAt) > parseISO(existingLatest.uploadedAt))) {
          latestActiveDocsMap.set(typeKey, doc);
        }
      }
    });

    // Add missing placeholders to the report if they pass filters
    DOCUMENT_TYPES.filter(dt => dt !== 'Other').forEach(standardDocType => {
        const typeKey = standardDocType;
        if (!latestActiveDocsMap.has(typeKey)) { // If no active doc, it's missing for reporting
            const status: VehicleDocument['status'] = 'Missing';
             let passesFilters = true;
            if (filters?.statuses && filters.statuses.length > 0 && !filters.statuses.includes(status)) {
                passesFilters = false;
            }
            if (filters?.documentTypes && filters.documentTypes.length > 0 && !filters.documentTypes.includes(standardDocType)) {
                passesFilters = false;
            }
            if(passesFilters){
                 reportableDocs.push({
                    id: `${vehicle.id}_missing_${standardDocType}`, // Synthetic ID
                    vehicleId: vehicle.id,
                    type: standardDocType,
                    status: status,
                    expiryDate: null,
                    startDate: null,
                    policyNumber: null,
                    uploadedAt: vehicle.createdAt, // Or some other relevant placeholder date
                    vehicleRegistration: vehicle.registrationNumber,
                    daysDifference: -Infinity, // Or a large negative number to sort appropriately
                });
            }
        }
    });
    // Also handle 'Other' custom types that might be expected but missing if a placeholder existed
    // This part is trickier as we don't have predefined 'Other' types.
    // For simplicity, we'll rely on explicitly uploaded 'Other' documents or placeholders.


    latestActiveDocsMap.forEach(doc => {
      const status = getDocumentComplianceStatus(doc.expiryDate); // expiryDate is guaranteed here
      let daysDiff = -Infinity;
      if (doc.expiryDate) { // Should always be true here
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
            ...doc, // Spread the actual document
            status: status, // Ensure status is the calculated one
            vehicleRegistration: vehicle.registrationNumber,
            daysDifference: daysDiff,
        });
      }
    });
  });
  // Sort: ExpiringSoon and Overdue first (by daysDifference asc), then Compliant, then Missing.
  // Within same status, sort by daysDifference, then by registration number.
  return reportableDocs.sort((a, b) => {
    const statusOrder = (s: ReportableDocument['status']) => {
        if (s === 'Overdue') return 1;
        if (s === 'ExpiringSoon') return 2;
        if (s === 'Compliant') return 3;
        if (s === 'Missing') return 4;
        return 5;
    };

    const statusDiff = statusOrder(a.status) - statusOrder(b.status);
    if (statusDiff !== 0) return statusDiff;

    const daysDiffCompare = a.daysDifference - b.daysDifference;
    if (daysDiffCompare !== 0) return daysDiffCompare;
    
    return a.vehicleRegistration.localeCompare(b.vehicleRegistration);
  });
}


export async function getCurrentUser(): Promise<User> {
  // Ensure data is initialized before trying to access any part of it, even if not directly used here
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
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
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
    const from = parseISO(filters.dateFrom); // Assumes YYYY-MM-DD
    from.setHours(0,0,0,0);
    filteredLogs = filteredLogs.filter(log => !isBefore(parseISO(log.timestamp), from));
  }
  if (filters?.dateTo) {
    const to = parseISO(filters.dateTo); // Assumes YYYY-MM-DD
    to.setHours(23, 59, 59, 999);
    filteredLogs = filteredLogs.filter(log => !isBefore(to, parseISO(log.timestamp))); // date is before or same as 'to'
  }

  return JSON.parse(JSON.stringify(filteredLogs.sort((a,b) => parseISO(b.timestamp).getTime() - parseISO(a.timestamp).getTime())));
}


export async function recordCsvExportAudit(reportName: string, formatUsed: string, filtersApplied: Record<string, any>) {
  internalLogAuditEvent('EXPORT_REPORT', 'REPORT', undefined, {
    reportName,
    format: formatUsed,
    filtersApplied, // This can be a complex object
  });
}

