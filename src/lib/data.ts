

import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, AuditLogEntry, AuditLogAction } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID, AI_SUPPORTED_DOCUMENT_TYPES } from './constants';
import { formatISO, addDays, isBefore, parseISO, differenceInDays } from 'date-fns';

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
  if (vehicles.length > 0) return;

  const today = new Date();
  const initialVehiclesData: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>[] = [
    { registrationNumber: 'MH12AB1234', type: 'Car', make: 'Toyota', model: 'Camry' },
    { registrationNumber: 'KA01CD5678', type: 'Truck', make: 'Volvo', model: 'FH' },
    { registrationNumber: 'DL03EF9012', type: 'Bus', make: 'Tata', model: 'Marcopolo' },
  ];

  vehicles = initialVehiclesData.map((v, index) => {
    const vehicleId = generateId();
    const createdAt = formatISO(today);
    const vehicleInstance: Vehicle = {
      ...v,
      id: vehicleId,
      createdAt,
      updatedAt: createdAt,
      documents: DOCUMENT_TYPES.map(docType => {
        let expiryDate: Date | null = null;
        const randDays = Math.random();
        
        if (index === 0) { 
            if (docType === 'Insurance') expiryDate = addDays(today, 10); 
            else if (docType === 'Fitness') expiryDate = addDays(today, -5); 
            else if (docType === 'PUC') expiryDate = addDays(today, 45); 
            else if (docType === 'AITP') expiryDate = null; 
        } else if (index === 1) { 
            if (docType === 'Insurance') expiryDate = addDays(today, 60); 
            else if (docType === 'Fitness') expiryDate = addDays(today, 20); 
            else if (docType === 'PUC') expiryDate = addDays(today, -15); 
            else if (docType === 'AITP') expiryDate = addDays(today, 300); 
        } else { 
            if (docType === 'Insurance') expiryDate = addDays(today, Math.floor(randDays * 90) - 15);
            else if (docType === 'Fitness') expiryDate = addDays(today, Math.floor(randDays * 365) - 45);
            else if (docType === 'PUC') expiryDate = addDays(today, Math.floor(randDays * 180) - 25);
            else if (docType === 'AITP' && (v.type === 'Bus' || v.type === 'Van')) expiryDate = addDays(today, Math.floor(randDays * 400) - 10);
            else if (docType === 'AITP') expiryDate = addDays(today, 365);
        }
        
        const doc: VehicleDocument = {
          id: generateId(),
          vehicleId,
          type: docType,
          expiryDate: expiryDate ? formatISO(expiryDate, { representation: 'date' }) : null,
          status: 'Missing', 
          uploadedAt: formatISO(addDays(today, -Math.floor(Math.random()*100))),
          documentName: expiryDate ? `${docType}_${v.registrationNumber}.pdf` : undefined,
          documentUrl: expiryDate ? `/uploads/mock/${docType}_${v.registrationNumber}.pdf` : undefined,
        };
        doc.status = getDocumentComplianceStatus(doc.expiryDate);
        return doc;
      })
    };
    logAuditEvent('CREATE_VEHICLE', 'VEHICLE', vehicleInstance.id, { registrationNumber: vehicleInstance.registrationNumber, make: vehicleInstance.make, model: vehicleInstance.model }, vehicleInstance.registrationNumber);
    return vehicleInstance;
  });
  generateAllAlerts();
};

export const getDocumentComplianceStatus = (expiryDate: string | null): VehicleDocument['status'] => {
  if (!expiryDate) return 'Missing';
  const now = new Date();
  const expDate = parseISO(expiryDate);
  if (isBefore(expDate, now)) return 'Overdue';
  if (differenceInDays(expDate, now) <= EXPIRY_WARNING_DAYS) return 'ExpiringSoon';
  return 'Compliant';
};

export async function getVehicles(): Promise<Vehicle[]> {
  initializeDummyData();
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
  const newVehicle: Vehicle = {
    ...vehicleData,
    id: generateId(),
    documents: DOCUMENT_TYPES.map(docType => ({
      id: generateId(),
      vehicleId: '', 
      type: docType,
      expiryDate: null,
      status: 'Missing',
      uploadedAt: formatISO(new Date()),
    })),
    createdAt: formatISO(new Date()),
    updatedAt: formatISO(new Date()),
  };
  newVehicle.documents.forEach(doc => doc.vehicleId = newVehicle.id);
  vehicles.push(newVehicle);
  logAuditEvent('CREATE_VEHICLE', 'VEHICLE', newVehicle.id, { registrationNumber: newVehicle.registrationNumber, make: newVehicle.make, model: newVehicle.model, type: newVehicle.type }, newVehicle.registrationNumber);
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
  logAuditEvent('UPDATE_VEHICLE', 'VEHICLE', id, { updates: changedFields }, vehicles[vehicleIndex].registrationNumber);
  generateAlertsForVehicle(vehicles[vehicleIndex]);
  return JSON.parse(JSON.stringify(vehicles[vehicleIndex]));
}

export async function deleteVehicle(id: string): Promise<boolean> {
  initializeDummyData();
  const vehicleToDelete = vehicles.find(v => v.id === id);
  if (!vehicleToDelete) return false;

  const initialLength = vehicles.length;
  vehicles = vehicles.filter(v => v.id !== id);
  alerts = alerts.filter(a => a.vehicleId !== id);
  if (vehicles.length < initialLength) {
    logAuditEvent('DELETE_VEHICLE', 'VEHICLE', id, { registrationNumber: vehicleToDelete.registrationNumber }, vehicleToDelete.registrationNumber);
    return true;
  }
  return false;
}

export async function addOrUpdateDocument(
  vehicleId: string,
  docData: Pick<VehicleDocument, 'type' | 'customTypeName' | 'expiryDate' | 'aiExtractedDate' | 'aiConfidence' | 'documentName'>
): Promise<Vehicle | undefined> {
  initializeDummyData();
  const vehicle = await getVehicleById(vehicleId); // Uses the safe version
  if (!vehicle) return undefined;

  const vehicleIndex = vehicles.findIndex(v => v.id === vehicleId);
  if (vehicleIndex === -1) return undefined; // Should not happen if vehicle was found

  const existingDocIndex = vehicles[vehicleIndex].documents.findIndex(
    d => d.type === docData.type && (docData.type !== 'Other' || d.customTypeName === docData.customTypeName)
  );

  const status = getDocumentComplianceStatus(docData.expiryDate);
  // Mock document URL
  const documentUrl = docData.documentName ? `/uploads/mock/${docData.documentName}` : undefined;
  const uploadedAt = formatISO(new Date());

  let action: AuditLogAction = 'UPLOAD_DOCUMENT';
  let oldDocDetails: Partial<VehicleDocument> = {};

  if (existingDocIndex > -1) {
    action = 'UPDATE_DOCUMENT';
    oldDocDetails = { ...vehicles[vehicleIndex].documents[existingDocIndex] };
    vehicles[vehicleIndex].documents[existingDocIndex] = {
      ...vehicles[vehicleIndex].documents[existingDocIndex],
      ...docData,
      documentUrl,
      status,
      uploadedAt, // Update uploadedAt to reflect the latest modification/upload
    };
  } else {
    vehicles[vehicleIndex].documents.push({
      ...docData,
      id: generateId(),
      vehicleId,
      documentUrl,
      status,
      uploadedAt,
    });
  }
  
  logAuditEvent(action, 'DOCUMENT', existingDocIndex > -1 ? vehicles[vehicleIndex].documents[existingDocIndex].id : vehicles[vehicleIndex].documents[vehicles[vehicleIndex].documents.length -1].id, {
    documentType: docData.type,
    customTypeName: docData.customTypeName,
    newExpiryDate: docData.expiryDate,
    oldExpiryDate: oldDocDetails.expiryDate,
    aiExtractedDate: docData.aiExtractedDate,
    aiConfidence: docData.aiConfidence,
    documentName: docData.documentName,
  }, vehicle.registrationNumber);

  generateAlertsForVehicle(vehicles[vehicleIndex]);
  return JSON.parse(JSON.stringify(vehicles[vehicleIndex]));
}


function generateAlertsForVehicle(vehicle: Vehicle) {
  alerts = alerts.filter(a => !(a.vehicleId === vehicle.id && a.userId === MOCK_USER_ID));

  vehicle.documents.forEach(doc => {
    if (doc.status === 'ExpiringSoon' || doc.status === 'Overdue') {
      if (doc.expiryDate) {
        alerts.push({
          id: generateId(),
          vehicleId: vehicle.id,
          vehicleRegistration: vehicle.registrationNumber,
          documentType: doc.type,
          customDocumentTypeName: doc.customTypeName,
          dueDate: doc.expiryDate,
          message: `${doc.type === 'Other' && doc.customDocumentTypeName ? doc.customDocumentTypeName : doc.type} for ${vehicle.registrationNumber} is ${doc.status === 'ExpiringSoon' ? `expiring on ${formatISO(parseISO(doc.expiryDate), { representation: 'date' })}` : `overdue since ${formatISO(parseISO(doc.expiryDate), { representation: 'date' })}`}.`,
          createdAt: formatISO(new Date()),
          isRead: false,
          userId: MOCK_USER_ID,
        } as Alert);
      }
    }
  });
}

function generateAllAlerts() {
  alerts = alerts.filter(a => a.userId !== MOCK_USER_ID);
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
  
  const allVehicles = await getVehicles();

  allVehicles.forEach(vehicle => {
    let isVehicleCompliant = true;
    vehicle.documents.forEach(doc => {
      const currentStatus = getDocumentComplianceStatus(doc.expiryDate);
      if (currentStatus === 'ExpiringSoon') expiringSoonDocumentsCount++;
      if (currentStatus === 'Overdue') overdueDocumentsCount++;
      if (currentStatus === 'Overdue' || currentStatus === 'Missing') isVehicleCompliant = false;
    });
    if (isVehicleCompliant) compliantVehiclesCount++;
  });

  return {
    totalVehicles: allVehicles.length,
    compliantVehicles: compliantVehiclesCount,
    expiringSoonDocuments: expiringSoonDocumentsCount,
    overdueDocuments: overdueDocumentsCount,
  };
}

export async function getCurrentUser(): Promise<User> {
  return {
    id: MOCK_USER_ID,
    name: "Demo User",
    email: "user@example.com",
    avatarUrl: `https://placehold.co/100x100.png?text=DU`
  };
}

// Ensure dummy data is initialized on module load
initializeDummyData();
