
// In a real application, this would interact with a database.
// For now, we'll use in-memory storage that resets on server restart,
// or potentially localStorage if we want persistence on the client for demo purposes.
// Let's stick to server-side in-memory for now to align with RSCs.

import type { Vehicle, VehicleDocument, Alert, SummaryStats, User } from './types';
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
  ];

  vehicles = initialVehicles.map(v => {
    const vehicleId = generateId();
    const createdAt = formatISO(today);
    return {
      ...v,
      id: vehicleId,
      createdAt,
      updatedAt: createdAt,
      documents: DOCUMENT_TYPES.map(docType => {
        let expiryDate: Date | null = null;
        if (docType === 'Insurance') expiryDate = addDays(today, Math.random() * 90); // Expires in 0-90 days
        else if (docType === 'Fitness') expiryDate = addDays(today, Math.random() * 365 - 30); // Expires in -30 to 335 days
        else if (docType === 'PUC') expiryDate = addDays(today, Math.random() * 180 - 60); // Expires in -60 to 120 days
        else if (docType === 'AITP') expiryDate = addDays(today, Math.random() * 400 - 15); // Expires in -15 to 385 days
        
        const doc: VehicleDocument = {
          id: generateId(),
          vehicleId,
          type: docType,
          expiryDate: expiryDate ? formatISO(expiryDate, { representation: 'date' }) : null,
          status: 'Missing', // Will be updated by getComplianceStatus
          uploadedAt: formatISO(addDays(today, -Math.random()*100)), // Uploaded some time ago
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
  return JSON.parse(JSON.stringify(vehicles.find(v => v.id === id)));
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
  // Remove existing alerts for this vehicle
  alerts = alerts.filter(a => a.vehicleId !== vehicle.id && a.userId === MOCK_USER_ID);

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
          message: `${doc.type === 'Other' ? doc.customTypeName : doc.type} for ${vehicle.registrationNumber} is ${doc.status === 'ExpiringSoon' ? `expiring on ${doc.expiryDate}` : `overdue since ${doc.expiryDate}`}.`,
          createdAt: formatISO(new Date()),
          isRead: false,
          userId: MOCK_USER_ID,
        } as Alert);
      }
    }
  });
}

function generateAllAlerts() {
  alerts = alerts.filter(a => a.userId !== MOCK_USER_ID); // Clear existing user alerts before regenerating
  vehicles.forEach(generateAlertsForVehicle);
}

export async function getAlerts(): Promise<Alert[]> {
  initializeDummyData();
  generateAllAlerts(); // Re-evaluate alerts based on current dates
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
  let compliantVehicles = 0;
  let expiringSoonDocuments = 0;
  let overdueDocuments = 0;

  let insuranceExpiringSoon = 0;
  let insuranceOverdue = 0;
  let fitnessExpiringSoon = 0;
  let fitnessOverdue = 0;
  let pucExpiringSoon = 0;
  let pucOverdue = 0;
  let aitpExpiringSoon = 0;
  let aitpOverdue = 0;

  vehicles.forEach(vehicle => {
    let isVehicleCompliant = true;
    vehicle.documents.forEach(doc => {
      const currentStatus = getDocumentComplianceStatus(doc.expiryDate);
      
      if (currentStatus === 'ExpiringSoon') expiringSoonDocuments++;
      if (currentStatus === 'Overdue') overdueDocuments++;
      if (currentStatus === 'Overdue' || currentStatus === 'Missing') isVehicleCompliant = false;

      if (doc.type === 'Insurance') {
        if (currentStatus === 'ExpiringSoon') insuranceExpiringSoon++;
        if (currentStatus === 'Overdue') insuranceOverdue++;
      } else if (doc.type === 'Fitness') {
        if (currentStatus === 'ExpiringSoon') fitnessExpiringSoon++;
        if (currentStatus === 'Overdue') fitnessOverdue++;
      } else if (doc.type === 'PUC') {
        if (currentStatus === 'ExpiringSoon') pucExpiringSoon++;
        if (currentStatus === 'Overdue') pucOverdue++;
      } else if (doc.type === 'AITP') {
        if (currentStatus === 'ExpiringSoon') aitpExpiringSoon++;
        if (currentStatus === 'Overdue') aitpOverdue++;
      }
    });
    if (isVehicleCompliant) compliantVehicles++;
  });

  return {
    totalVehicles: vehicles.length,
    compliantVehicles,
    expiringSoonDocuments,
    overdueDocuments,
    insuranceExpiringSoon,
    insuranceOverdue,
    fitnessExpiringSoon,
    fitnessOverdue,
    pucExpiringSoon,
    pucOverdue,
    aitpExpiringSoon,
    aitpOverdue,
  };
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
