
// In a real application, this would interact with a database.
// For now, we'll use in-memory storage that resets on server restart,
// or potentially localStorage if we want persistence on the client for demo purposes.
// Let's stick to server-side in-memory for now to align with RSCs.

import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, DocumentComplianceDetail } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID } from './constants';
import { formatISO, addDays, isBefore, parseISO, differenceInDays } from 'date-fns';

let vehicles: Vehicle[] = [];
let alerts: Alert[] = [];

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

// Initialize with some dummy data
const initializeDummyData = () => {
  if (vehicles.length > 0) return; // Avoid re-initializing

  const today = new Date();
  const initialVehicles: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>[] = [
    { registrationNumber: 'MH12AB1234', type: 'Car', make: 'Toyota', model: 'Camry' },
    { registrationNumber: 'KA01CD5678', type: 'Truck', make: 'Volvo', model: 'FH' },
    { registrationNumber: 'DL03EF9012', type: 'Bus', make: 'Tata', model: 'Marcopolo' },
    { registrationNumber: 'TN22XY7890', type: 'Van', make: 'Force', model: 'Traveller' },
    { registrationNumber: 'PY01ZQ4567', type: 'Motorcycle', make: 'Honda', model: 'Activa' },
    { registrationNumber: 'GJ05RE7755', type: 'Car', make: 'Maruti', model: 'Swift' },
    { registrationNumber: 'UP16GH2468', type: 'Truck', make: 'Ashok Leyland', model: 'Dost' },
  ];

  vehicles = initialVehicles.map((v, index) => {
    const vehicleId = generateId();
    const createdAt = formatISO(today);
    return {
      ...v,
      id: vehicleId,
      createdAt,
      updatedAt: createdAt,
      documents: DOCUMENT_TYPES.map(docType => {
        let expiryDate: Date | null = null;
        const randDays = Math.random();
        
        // Make data more varied for dashboard
        if (index === 0) { // MH12AB1234
            if (docType === 'Insurance') expiryDate = addDays(today, 10); // Expiring soon
            else if (docType === 'Fitness') expiryDate = addDays(today, -5); // Overdue
            else if (docType === 'PUC') expiryDate = addDays(today, 45); // Compliant
            else if (docType === 'AITP') expiryDate = null; // Missing
        } else if (index === 1) { // KA01CD5678
            if (docType === 'Insurance') expiryDate = addDays(today, 60); // Compliant
            else if (docType === 'Fitness') expiryDate = addDays(today, 20); // Expiring soon
            else if (docType === 'PUC') expiryDate = addDays(today, -15); // Overdue
            else if (docType === 'AITP') expiryDate = addDays(today, 300); // Compliant
        } else if (index === 2 && v.type === 'Bus') { // DL03EF9012 (Bus)
            if (docType === 'Insurance') expiryDate = addDays(today, 5); // Expiring Soon
            else if (docType === 'Fitness') expiryDate = addDays(today, 25); // Expiring Soon
            else if (docType === 'PUC') expiryDate = addDays(today, 90); // Compliant
            else if (docType === 'AITP') expiryDate = addDays(today, -10); // Overdue
        } else { // Other vehicles general logic
            if (docType === 'Insurance') expiryDate = addDays(today, Math.floor(randDays * 90) - 15);
            else if (docType === 'Fitness') expiryDate = addDays(today, Math.floor(randDays * 365) - 45);
            else if (docType === 'PUC') expiryDate = addDays(today, Math.floor(randDays * 180) - 25);
            else if (docType === 'AITP' && (v.type === 'Bus' || v.type === 'Van')) expiryDate = addDays(today, Math.floor(randDays * 400) - 10);
            else if (docType === 'AITP') expiryDate = addDays(today, 365); // Compliant for non-commercial/tourist
        }
        
        const doc: VehicleDocument = {
          id: generateId(),
          vehicleId,
          type: docType,
          expiryDate: expiryDate ? formatISO(expiryDate, { representation: 'date' }) : null,
          status: 'Missing', 
          uploadedAt: formatISO(addDays(today, -Math.floor(Math.random()*100))),
        };
        doc.status = getDocumentComplianceStatus(doc.expiryDate);
        return doc;
      })
    };
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

// Vehicle CRUD
export async function getVehicles(): Promise<Vehicle[]> {
  initializeDummyData();
  return JSON.parse(JSON.stringify(vehicles)); // Deep copy to prevent mutation
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
      vehicleId: '', // Will be set below
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
  generateAlertsForVehicle(newVehicle);
  return JSON.parse(JSON.stringify(newVehicle));
}

export async function updateVehicle(id: string, updates: Partial<Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>>): Promise<Vehicle | undefined> {
  initializeDummyData();
  const vehicleIndex = vehicles.findIndex(v => v.id === id);
  if (vehicleIndex === -1) return undefined;
  vehicles[vehicleIndex] = { ...vehicles[vehicleIndex], ...updates, updatedAt: formatISO(new Date()) };
  generateAlertsForVehicle(vehicles[vehicleIndex]);
  return JSON.parse(JSON.stringify(vehicles[vehicleIndex]));
}

export async function deleteVehicle(id: string): Promise<boolean> {
  initializeDummyData();
  const initialLength = vehicles.length;
  vehicles = vehicles.filter(v => v.id !== id);
  alerts = alerts.filter(a => a.vehicleId !== id);
  return vehicles.length < initialLength;
}

// Document Management
export async function addOrUpdateDocument(vehicleId: string, docData: Omit<VehicleDocument, 'id' | 'vehicleId' | 'status' | 'uploadedAt'> & { documentFile?: File }): Promise<Vehicle | undefined> {
  initializeDummyData();
  const vehicle = await getVehicleById(vehicleId);
  if (!vehicle) return undefined;

  const existingDocIndex = vehicle.documents.findIndex(d => d.type === docData.type && (docData.type !== 'Other' || d.customTypeName === docData.customTypeName));
  
  const status = getDocumentComplianceStatus(docData.expiryDate);
  const documentUrl = docData.documentFile ? `/placeholder/documents/${docData.documentFile.name}` : docData.documentUrl; // Simulate file storage

  if (existingDocIndex > -1) {
    vehicle.documents[existingDocIndex] = {
      ...vehicle.documents[existingDocIndex],
      ...docData,
      documentUrl,
      status,
      uploadedAt: formatISO(new Date()),
    };
  } else {
    vehicle.documents.push({
      ...docData,
      id: generateId(),
      vehicleId,
      documentUrl,
      status,
      uploadedAt: formatISO(new Date()),
    });
  }
  
  const vehicleIndex = vehicles.findIndex(v => v.id === vehicleId);
  vehicles[vehicleIndex] = vehicle;
  generateAlertsForVehicle(vehicle);
  return JSON.parse(JSON.stringify(vehicle));
}


// Alerts
function generateAlertsForVehicle(vehicle: Vehicle) {
  // Remove existing alerts for this vehicle that belong to the current mock user
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
  // Filter out alerts for the MOCK_USER_ID and then regenerate them.
  // This approach ensures that alerts for other users (if any in a future multi-user system) are not affected.
  alerts = alerts.filter(a => a.userId !== MOCK_USER_ID);
  vehicles.forEach(vehicle => generateAlertsForVehicle(vehicle)); // Pass vehicle directly
}


export async function getAlerts(): Promise<Alert[]> {
  initializeDummyData();
  generateAllAlerts(); 
  return JSON.parse(JSON.stringify(alerts.filter(a => a.userId === MOCK_USER_ID).sort((a,b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime())));
}

export async function markAlertAsRead(alertId: string): Promise<boolean> {
  const alert = alerts.find(a => a.id === alertId && a.userId === MOCK_USER_ID);
  if (alert) {
    alert.isRead = true;
    return true;
  }
  return false;
}

// Dashboard Stats
export async function getSummaryStats(): Promise<SummaryStats> {
  initializeDummyData();
  let compliantVehiclesCount = 0;
  let expiringSoonDocumentsCount = 0;
  let overdueDocumentsCount = 0;
  
  const allVehicles = await getVehicles(); // Use the getter to ensure data is initialized

  allVehicles.forEach(vehicle => {
    let isVehicleCompliant = true;
    let vehicleHasExpiring = false;
    let vehicleHasOverdue = false;

    vehicle.documents.forEach(doc => {
      const currentStatus = getDocumentComplianceStatus(doc.expiryDate);
      
      if (currentStatus === 'ExpiringSoon') {
        expiringSoonDocumentsCount++;
        vehicleHasExpiring = true;
      }
      if (currentStatus === 'Overdue') {
        overdueDocumentsCount++;
        vehicleHasOverdue = true;
      }
      if (currentStatus === 'Overdue' || currentStatus === 'Missing') {
        isVehicleCompliant = false;
      }
    });
    if (isVehicleCompliant) {
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


export async function getDocumentComplianceDetailsForDashboard(vehicles: Vehicle[]): Promise<Record<DocumentType, DocumentComplianceDetail[]>> {
  const details: Record<DocumentType, DocumentComplianceDetail[]> = {
    Insurance: [],
    Fitness: [],
    PUC: [],
    AITP: [],
    Other: [], // Though 'Other' might not be explicitly listed like this on dashboard
  };

  const now = new Date();

  vehicles.forEach(vehicle => {
    vehicle.documents.forEach(doc => {
      if (doc.expiryDate) {
        const expiry = parseISO(doc.expiryDate);
        const daysDifference = differenceInDays(expiry, now);
        const complianceStatus = getDocumentComplianceStatus(doc.expiryDate);

        if (complianceStatus === 'Overdue' || complianceStatus === 'ExpiringSoon') {
          if (details[doc.type]) { // Check if doc.type is a key in details
            details[doc.type].push({
              vehicleId: vehicle.id,
              vehicleRegistration: vehicle.registrationNumber,
              documentId: doc.id,
              customTypeName: doc.customTypeName,
              expiryDate: doc.expiryDate,
              daysRemaining: daysDifference, // Can be negative for overdue
              status: complianceStatus,
            });
          }
        }
      }
    });
  });

  // Sort each list: overdue first, then by days remaining (soonest expiring)
  for (const docType in details) {
    details[docType as DocumentType].sort((a, b) => {
      if (a.status === 'Overdue' && b.status !== 'Overdue') return -1;
      if (a.status !== 'Overdue' && b.status === 'Overdue') return 1;
      return a.daysRemaining - b.daysRemaining;
    });
  }
  return details;
}


// User (mock)
export async function getCurrentUser(): Promise<User> {
  return {
    id: MOCK_USER_ID,
    name: "Demo User",
    email: "user@example.com",
    avatarUrl: `https://placehold.co/100x100.png?text=DU`
  };
}

initializeDummyData();
