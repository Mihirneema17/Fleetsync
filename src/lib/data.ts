

import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, AuditLogEntry, AuditLogAction, DocumentType, ReportableDocument } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID, AI_SUPPORTED_DOCUMENT_TYPES } from './constants';
import { format, formatISO, addDays, isBefore, parseISO, differenceInDays } from 'date-fns';

let vehicles: Vehicle[] = [];
let alerts: Alert[] = [];
let auditLogs: AuditLogEntry[] = [];

const generateId = () => Math.random().toString(36).substr(2, 9);

const logAuditEvent = (
  action: AuditLogAction,
  entityType: AuditLogEntry['entityType'],
  entityId: string,
  details: Record<string, any>,
  entityRegistration?: string
) => {
  auditLogs.push({
    id: generateId(),
    timestamp: formatISO(new Date()),
    userId: MOCK_USER_ID, // In a real app, this would be the actual logged-in user
    action,
    entityType,
    entityId,
    entityRegistration,
    details,
  });
};

const initializeDummyData = () => {
  if (vehicles.length > 0 && alerts.length > 0) return; // Basic check if already initialized

  const today = new Date();
  const initialVehiclesData: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>[] = [
    { registrationNumber: 'MH12AB1234', type: 'Car', make: 'Toyota', model: 'Camry' },
    { registrationNumber: 'KA01CD5678', type: 'Truck', make: 'Volvo', model: 'FH' },
    { registrationNumber: 'DL03EF9012', type: 'Bus', make: 'Tata', model: 'Marcopolo' },
    { registrationNumber: 'TN07GH4567', type: 'Van', make: 'Force', model: 'Traveller' },
    { registrationNumber: 'PY01JK8901', type: 'Motorcycle', make: 'Royal Enfield', model: 'Classic 350' },
  ];
   
  vehicles = initialVehiclesData.map((v, index) => {
    const vehicleId = generateId();
    const createdAt = formatISO(addDays(today, - (index * 30 + Math.floor(Math.random() * 30)) )); // Vary creation dates
    const vehicleInstance: Vehicle = {
      ...v,
      id: vehicleId,
      createdAt,
      updatedAt: createdAt,
      documents: [] // will be populated below
    };

    vehicleInstance.documents = DOCUMENT_TYPES.map(docType => {
        let expiryDate: Date | null = null;
        const randDays = Math.random();
        
        // More varied expiry dates
        if (index === 0) { // MH12AB1234 (Car)
            if (docType === 'Insurance') expiryDate = addDays(today, 10); // Expiring soon
            else if (docType === 'Fitness') expiryDate = addDays(today, -5); // Overdue
            else if (docType === 'PUC') expiryDate = addDays(today, 45); // Compliant
            else if (docType === 'AITP') expiryDate = null; // Missing (Cars don't usually need AITP)
        } else if (index === 1) { // KA01CD5678 (Truck)
            if (docType === 'Insurance') expiryDate = addDays(today, 60); // Compliant
            else if (docType === 'Fitness') expiryDate = addDays(today, 20); // Expiring soon
            else if (docType === 'PUC') expiryDate = addDays(today, -15); // Overdue
            else if (docType === 'AITP') expiryDate = addDays(today, 100); // Compliant
        } else if (index === 2) { // DL03EF9012 (Bus)
            if (docType === 'Insurance') expiryDate = addDays(today, 5); // Expiring soon
            else if (docType === 'Fitness') expiryDate = addDays(today, 90); // Compliant
            else if (docType === 'PUC') expiryDate = addDays(today, 25); // Expiring soon
            else if (docType === 'AITP') expiryDate = addDays(today, -3); // Overdue
        } else { // Other vehicles with more random data
            const offset = Math.floor(randDays * 120) - 30; // -30 to 90 days from today
            if (docType === 'AITP' && (v.type === 'Car' || v.type === 'Motorcycle')) {
                expiryDate = null; // AITP not typical for cars/motorcycles
            } else if (Math.random() < 0.2) { // 20% chance of missing doc
                 expiryDate = null;
            } else {
                 expiryDate = addDays(today, offset);
            }
        }
        
        const doc: VehicleDocument = {
          id: generateId(),
          vehicleId,
          type: docType,
          customTypeName: docType === 'Other' ? 'Custom Doc ' + Math.floor(Math.random()*10) : undefined,
          expiryDate: expiryDate ? formatISO(expiryDate, { representation: 'date' }) : null,
          status: 'Missing', 
          uploadedAt: formatISO(addDays(parseISO(createdAt), Math.floor(Math.random()*10))), // Uploaded after vehicle creation
          documentName: expiryDate ? `${docType}_${v.registrationNumber}.pdf` : undefined,
          documentUrl: expiryDate ? `/uploads/mock/${docType}_${v.registrationNumber}.pdf` : undefined, // Mock URL
          aiExtractedDate: AI_SUPPORTED_DOCUMENT_TYPES.includes(docType) && expiryDate && Math.random() > 0.5 ? formatISO(addDays(expiryDate, Math.floor(Math.random()*6)-3), {representation: 'date'}) : null,
          aiConfidence: AI_SUPPORTED_DOCUMENT_TYPES.includes(docType) && expiryDate && Math.random() > 0.5 ? Math.random() : null,
        };
        doc.status = getDocumentComplianceStatus(doc.expiryDate);
        return doc;
      });
    logAuditEvent('CREATE_VEHICLE', 'VEHICLE', vehicleInstance.id, { registrationNumber: vehicleInstance.registrationNumber, make: vehicleInstance.make, model: vehicleInstance.model }, vehicleInstance.registrationNumber);
    return vehicleInstance;
  });
  generateAllAlerts(); // Generate alerts after vehicles and documents are set up
};


export const getDocumentComplianceStatus = (expiryDate: string | null): VehicleDocument['status'] => {
  if (!expiryDate) return 'Missing';
  const now = new Date();
  const expDate = parseISO(expiryDate);
  // Set time to end of day for expiry for fair comparison
  expDate.setHours(23, 59, 59, 999);
  now.setHours(0,0,0,0); // Start of today

  if (isBefore(expDate, now)) return 'Overdue';
  if (differenceInDays(expDate, now) < EXPIRY_WARNING_DAYS) return 'ExpiringSoon'; // Use < not <= to make 30 days mean 29 days left or less
  return 'Compliant';
};


export async function getVehicles(): Promise<Vehicle[]> {
  initializeDummyData();
  // Deep copy to prevent direct mutation of in-memory store by consumers
  return JSON.parse(JSON.stringify(vehicles)); 
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  initializeDummyData();
  const vehicle = vehicles.find(v => v.id === id);
  if (vehicle) {
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
    documents: DOCUMENT_TYPES.map(docType => ({
      id: generateId(),
      vehicleId: vehicleId, 
      type: docType,
      customTypeName: docType === 'Other' ? 'Default Custom' : undefined,
      expiryDate: null,
      status: 'Missing',
      uploadedAt: nowISO,
    })),
    createdAt: nowISO,
    updatedAt: nowISO,
  };
  vehicles.push(newVehicle);
  logAuditEvent('CREATE_VEHICLE', 'VEHICLE', newVehicle.id, { registrationNumber: newVehicle.registrationNumber, make: newVehicle.make, model: newVehicle.model, type: newVehicle.type }, newVehicle.registrationNumber);
  generateAlertsForVehicle(newVehicle); // Generate alerts for the new vehicle
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
    logAuditEvent('UPDATE_VEHICLE', 'VEHICLE', id, { updates: changedFields }, vehicles[vehicleIndex].registrationNumber);
  }
  generateAlertsForVehicle(vehicles[vehicleIndex]); // Re-generate alerts if vehicle details change that might affect them
  return JSON.parse(JSON.stringify(vehicles[vehicleIndex]));
}

export async function deleteVehicle(id: string): Promise<boolean> {
  initializeDummyData();
  const vehicleIndex = vehicles.findIndex(v => v.id === id);
  if (vehicleIndex === -1) return false;

  const vehicleToDelete = vehicles[vehicleIndex];
  vehicles.splice(vehicleIndex, 1); // Remove vehicle
  alerts = alerts.filter(a => a.vehicleId !== id); // Remove associated alerts

  logAuditEvent('DELETE_VEHICLE', 'VEHICLE', id, { registrationNumber: vehicleToDelete.registrationNumber }, vehicleToDelete.registrationNumber);
  return true;
}


export async function addOrUpdateDocument(
  vehicleId: string,
  docData: Pick<VehicleDocument, 'type' | 'customTypeName' | 'expiryDate' | 'aiExtractedDate' | 'aiConfidence' | 'documentName'>
): Promise<Vehicle | undefined> {
  initializeDummyData();
  const vehicleIndex = vehicles.findIndex(v => v.id === vehicleId);
  if (vehicleIndex === -1) return undefined;

  const vehicle = vehicles[vehicleIndex];
  const existingDocIndex = vehicle.documents.findIndex(
    d => d.type === docData.type && (docData.type !== 'Other' || d.customTypeName === docData.customTypeName)
  );

  const status = getDocumentComplianceStatus(docData.expiryDate);
  const documentUrl = docData.documentName ? `/uploads/mock/${docData.documentName}` : undefined; // Mock URL
  const uploadedAt = formatISO(new Date());

  let action: AuditLogAction = 'UPLOAD_DOCUMENT';
  let oldDocDetails: Partial<VehicleDocument> = {};
  let docIdToLog: string;

  if (existingDocIndex > -1) {
    action = 'UPDATE_DOCUMENT';
    oldDocDetails = { ...vehicle.documents[existingDocIndex] };
    vehicle.documents[existingDocIndex] = {
      ...vehicle.documents[existingDocIndex],
      ...docData,
      expiryDate: docData.expiryDate, // Ensure it's correctly updated
      documentUrl, // Update URL if new file, or retain if only date changed
      documentName: docData.documentName || vehicle.documents[existingDocIndex].documentName, // Retain old name if not changed
      status,
      uploadedAt, // Reflects the latest modification/upload
    };
    docIdToLog = vehicle.documents[existingDocIndex].id;
  } else {
    const newDocId = generateId();
    vehicle.documents.push({
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
    });
    docIdToLog = newDocId;
  }
  
  vehicles[vehicleIndex].updatedAt = formatISO(new Date()); // Update vehicle's updatedAt timestamp

  logAuditEvent(action, 'DOCUMENT', docIdToLog, {
    documentType: docData.type,
    customTypeName: docData.customTypeName,
    newExpiryDate: docData.expiryDate,
    oldExpiryDate: oldDocDetails.expiryDate,
    aiExtractedDate: docData.aiExtractedDate,
    aiConfidence: docData.aiConfidence,
    documentName: docData.documentName,
  }, vehicle.registrationNumber);

  generateAlertsForVehicle(vehicle); // Re-generate alerts for this vehicle
  return JSON.parse(JSON.stringify(vehicle));
}



function generateAlertsForVehicle(vehicle: Vehicle) {
  // Remove existing alerts for this specific user and vehicle to avoid duplicates
  alerts = alerts.filter(a => !(a.vehicleId === vehicle.id && a.userId === MOCK_USER_ID));

  vehicle.documents.forEach(doc => {
    // Re-calculate status as it might have changed
    const currentStatus = getDocumentComplianceStatus(doc.expiryDate);
    if (currentStatus === 'ExpiringSoon' || currentStatus === 'Overdue') {
      if (doc.expiryDate) { // Ensure expiryDate is not null
        const existingAlert = alerts.find(a => 
            a.vehicleId === vehicle.id && 
            a.documentType === doc.type && 
            (doc.type !== 'Other' || a.customDocumentTypeName === doc.customTypeName) &&
            a.dueDate === doc.expiryDate &&
            a.userId === MOCK_USER_ID
        );

        if (!existingAlert) { // Add alert only if a similar one doesn't exist
            alerts.push({
              id: generateId(),
              vehicleId: vehicle.id,
              vehicleRegistration: vehicle.registrationNumber,
              documentType: doc.type,
              customDocumentTypeName: doc.customTypeName,
              dueDate: doc.expiryDate,
              message: `${doc.type === 'Other' && doc.customTypeName ? doc.customTypeName : doc.type} for ${vehicle.registrationNumber} is ${currentStatus === 'ExpiringSoon' ? `expiring on ${format(parseISO(doc.expiryDate), 'PPP')}` : `overdue since ${format(parseISO(doc.expiryDate), 'PPP')}`}.`,
              createdAt: formatISO(new Date()),
              isRead: false,
              userId: MOCK_USER_ID, // Associate with the mock user
            } as Alert);
        }
      }
    }
  });
}

function generateAllAlerts() {
  // Clear alerts only for MOCK_USER_ID to prevent wiping other users' alerts if app were multi-user
  alerts = alerts.filter(a => a.userId !== MOCK_USER_ID);
  vehicles.forEach(vehicle => generateAlertsForVehicle(vehicle));
}


export async function getAlerts(onlyUnread: boolean = false): Promise<Alert[]> {
  initializeDummyData(); // Ensure data is loaded
  generateAllAlerts(); // Regenerate alerts based on current document statuses
  let userAlerts = alerts.filter(a => a.userId === MOCK_USER_ID);
  if (onlyUnread) {
    userAlerts = userAlerts.filter(a => !a.isRead);
  }
  // Sort by created date, newest first
  return JSON.parse(JSON.stringify(userAlerts.sort((a,b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime())));
}


export async function markAlertAsRead(alertId: string): Promise<boolean> {
  const alert = alerts.find(a => a.id === alertId && a.userId === MOCK_USER_ID);
  if (alert) {
    alert.isRead = true;
    logAuditEvent('MARK_ALERT_READ', 'ALERT', alertId, { documentType: alert.documentType, vehicleRegistration: alert.vehicleRegistration });
    return true;
  }
  return false;
}

export async function getSummaryStats(): Promise<SummaryStats> {
  initializeDummyData();
  let compliantVehiclesCount = 0;
  let expiringSoonDocumentsCount = 0;
  let overdueDocumentsCount = 0;
  
  const allVehicles = await getVehicles(); // This already deep copies

  allVehicles.forEach(vehicle => {
    let isVehicleCompliant = true;
    let vehicleHasMissingDocs = false;
    if (vehicle.documents.length === 0) vehicleHasMissingDocs = true;

    vehicle.documents.forEach(doc => {
      const currentStatus = getDocumentComplianceStatus(doc.expiryDate);
      if (currentStatus === 'ExpiringSoon') expiringSoonDocumentsCount++;
      if (currentStatus === 'Overdue') overdueDocumentsCount++;
      if (currentStatus === 'Overdue' || currentStatus === 'Missing') {
        isVehicleCompliant = false;
        if(currentStatus === 'Missing') vehicleHasMissingDocs = true;
      }
    });
    // A vehicle is only compliant if all its documents are compliant (not ExpiringSoon, not Overdue, not Missing)
    // The definition of compliant for the summary might differ, here it means no red flags.
    // If we want "Compliant" to mean "not overdue and not missing", we adjust.
    // For the PRD, "Compliant Vehicles" typically means not having any overdue OR missing critical documents.
    // Let's assume ExpiringSoon docs don't make a vehicle non-compliant for this summary.
    let vehicleTrulyCompliant = true;
     vehicle.documents.forEach(doc => {
        const status = getDocumentComplianceStatus(doc.expiryDate);
        if (status === 'Overdue' || status === 'Missing') {
            vehicleTrulyCompliant = false;
        }
    });
    if (vehicleTrulyCompliant && !vehicleHasMissingDocs && vehicle.documents.length > 0) { // must have some docs to be compliant
        compliantVehiclesCount++;
    }

  });

  return {
    totalVehicles: allVehicles.length,
    compliantVehicles: compliantVehiclesCount,
    expiringSoonDocuments: expiringSoonDocumentsCount,
    overdueDocuments: overdueDocumentsCount,
  };
}

export async function getReportableDocuments(
  filters?: { 
    statuses?: Array<'ExpiringSoon' | 'Overdue' | 'Compliant' | 'Missing'>, 
    documentTypes?: DocumentType[] 
  }
): Promise<ReportableDocument[]> {
  initializeDummyData();
  const allVehicles = await getVehicles(); // Gets a deep copy
  const reportableDocs: ReportableDocument[] = [];
  const now = new Date();
  now.setHours(0,0,0,0);


  allVehicles.forEach(vehicle => {
    vehicle.documents.forEach(doc => {
      const status = getDocumentComplianceStatus(doc.expiryDate);
      let daysDiff = 0;
      if (doc.expiryDate) {
        const expDate = parseISO(doc.expiryDate);
        expDate.setHours(23,59,59,999);
        daysDiff = differenceInDays(expDate, now);
      } else {
        daysDiff = -Infinity; // For missing documents, to sort them as most critical if needed
      }

      // Apply filters
      let passesFilters = true;
      if (filters?.statuses && filters.statuses.length > 0 && !filters.statuses.includes(status)) {
        passesFilters = false;
      }
      if (filters?.documentTypes && filters.documentTypes.length > 0 && !filters.documentTypes.includes(doc.type)) {
        passesFilters = false;
      }
      
      if (passesFilters && (status === 'ExpiringSoon' || status === 'Overdue')) { // Default to ExpiringSoon or Overdue if no status filter
         if(filters?.statuses && filters.statuses.length > 0) { // If status filter is present, it must pass
            if (filters.statuses.includes(status)) {
                 reportableDocs.push({
                    ...doc,
                    vehicleRegistration: vehicle.registrationNumber,
                    daysDifference: daysDiff,
                    status: status, // ensure status is up-to-date
                });
            }
         } else { // If no status filter, include ExpiringSoon and Overdue by default
            reportableDocs.push({
                ...doc,
                vehicleRegistration: vehicle.registrationNumber,
                daysDifference: daysDiff,
                status: status, // ensure status is up-to-date
            });
         }
      } else if (passesFilters && filters?.statuses && filters.statuses.includes(status) ) { // If status filter includes compliant/missing
         reportableDocs.push({
            ...doc,
            vehicleRegistration: vehicle.registrationNumber,
            daysDifference: daysDiff,
            status: status, // ensure status is up-to-date
        });
      }


    });
  });

  // Sort by daysDifference (overdue first, then soonest expiring)
  return reportableDocs.sort((a, b) => a.daysDifference - b.daysDifference);
}


export async function getCurrentUser(): Promise<User> {
  // In a real app, this would fetch user data from an auth service
  return {
    id: MOCK_USER_ID,
    name: "Demo User",
    email: "user@example.com",
    avatarUrl: `https://placehold.co/100x100.png?text=DU`
  };
}

// Ensure dummy data is initialized on module load if not already
initializeDummyData();