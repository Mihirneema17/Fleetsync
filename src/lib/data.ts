
import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, AuditLogEntry, AuditLogAction, DocumentType, ReportableDocument, UserRole, VehicleComplianceStatusBreakdown } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID, AI_SUPPORTED_DOCUMENT_TYPES } from './constants';
import { format, formatISO, addDays, isBefore, parseISO, differenceInDays } from 'date-fns';

let vehicles: Vehicle[] = [];
let alerts: Alert[] = [];
let auditLogs: AuditLogEntry[] = [];

const generateId = () => Math.random().toString(36).substr(2, 9);

const logAuditEvent = (
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
    { registrationNumber: 'PY01JK8901', type: 'Motorcycle', make: 'Royal Enfield', model: 'Classic 350' },
    { registrationNumber: 'MH14XY7890', type: 'Car', make: 'Honda', model: 'City' },
    { registrationNumber: 'GJ05TR0001', type: 'Truck', make: 'Ashok Leyland', model: 'Dost' },
    { registrationNumber: 'UP32BS0007', type: 'Custom Utility Vehicle', make: 'Mahindra', model: 'Bolero Camper' },

  ];
   
  vehicles = initialVehiclesData.map((v, index) => {
    const vehicleId = generateId();
    const createdAt = formatISO(addDays(today, - (index * 30 + Math.floor(Math.random() * 30)) )); 
    const vehicleInstance: Vehicle = {
      ...v,
      id: vehicleId,
      createdAt,
      updatedAt: createdAt,
      documents: [] 
    };

    vehicleInstance.documents = DOCUMENT_TYPES.map(docType => {
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
            else if (docType === 'AITP') expiryDate = addDays(today, 100); 
        } else if (index === 2) { 
            if (docType === 'Insurance') expiryDate = addDays(today, 5); 
            else if (docType === 'Fitness') expiryDate = addDays(today, 90); 
            else if (docType === 'PUC') expiryDate = addDays(today, 25); 
            else if (docType === 'AITP') expiryDate = addDays(today, -3); 
        } else { 
            const offset = Math.floor(randDays * 120) - 30; 
            if (docType === 'AITP' && (v.type === 'Car' || v.type === 'Motorcycle')) {
                expiryDate = null; 
            } else if (Math.random() < 0.2) { 
                 expiryDate = null;
            } else {
                 expiryDate = addDays(today, offset);
            }
        }
        
        const doc: VehicleDocument = {
          id: generateId(),
          vehicleId,
          type: docType,
          customTypeName: docType === 'Other' ? 'Permit ' + Math.floor(Math.random()*10) : undefined,
          expiryDate: expiryDate ? formatISO(expiryDate, { representation: 'date' }) : null,
          status: 'Missing', 
          uploadedAt: formatISO(addDays(parseISO(createdAt), Math.floor(Math.random()*10))), 
          documentName: expiryDate ? `${docType}_${v.registrationNumber}.pdf` : undefined,
          documentUrl: expiryDate ? `/uploads/mock/${docType}_${v.registrationNumber}.pdf` : undefined, 
          aiExtractedDate: AI_SUPPORTED_DOCUMENT_TYPES.includes(docType) && expiryDate && Math.random() > 0.5 ? formatISO(addDays(expiryDate, Math.floor(Math.random()*6)-3), {representation: 'date'}) : null,
          aiConfidence: AI_SUPPORTED_DOCUMENT_TYPES.includes(docType) && expiryDate && Math.random() > 0.5 ? Math.random() : null,
        };
        doc.status = getDocumentComplianceStatus(doc.expiryDate);
        return doc;
      });
    logAuditEvent('CREATE_VEHICLE', 'VEHICLE', vehicleInstance.id, { registrationNumber: vehicleInstance.registrationNumber, make: vehicleInstance.make, model: vehicleInstance.model, type: vehicleInstance.type }, vehicleInstance.registrationNumber);
    return vehicleInstance;
  });
  generateAllAlerts(); 
  logAuditEvent('SYSTEM_START', 'SYSTEM', undefined, { message: 'Dummy data initialized' });
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
    logAuditEvent('UPDATE_VEHICLE', 'VEHICLE', id, { updates: changedFields }, vehicles[vehicleIndex].registrationNumber);
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
  const documentUrl = docData.documentName ? `/uploads/mock/${vehicle.registrationNumber}/${docData.documentName}` : undefined; 
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
      expiryDate: docData.expiryDate, 
      documentUrl: documentUrl || vehicle.documents[existingDocIndex].documentUrl, 
      documentName: docData.documentName || vehicle.documents[existingDocIndex].documentName, 
      status,
      uploadedAt, 
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
  
  vehicles[vehicleIndex].updatedAt = formatISO(new Date()); 

  logAuditEvent(action, 'DOCUMENT', docIdToLog, {
    documentType: docData.type,
    customTypeName: docData.customTypeName,
    newExpiryDate: docData.expiryDate,
    oldExpiryDate: oldDocDetails.expiryDate,
    aiExtractedDate: docData.aiExtractedDate,
    aiConfidence: docData.aiConfidence,
    documentName: docData.documentName,
  }, vehicle.registrationNumber);

  generateAlertsForVehicle(vehicle); 
  return JSON.parse(JSON.stringify(vehicle));
}

function generateAlertsForVehicle(vehicle: Vehicle) {
  alerts = alerts.filter(a => !(a.vehicleId === vehicle.id && a.userId === MOCK_USER_ID));

  vehicle.documents.forEach(doc => {
    const currentStatus = getDocumentComplianceStatus(doc.expiryDate);
    if (currentStatus === 'ExpiringSoon' || currentStatus === 'Overdue') {
      if (doc.expiryDate) { 
        const existingAlert = alerts.find(a => 
            a.vehicleId === vehicle.id && 
            a.documentType === doc.type && 
            (doc.type !== 'Other' || a.customDocumentTypeName === doc.customTypeName) &&
            a.dueDate === doc.expiryDate &&
            a.userId === MOCK_USER_ID
        );

        if (!existingAlert) { 
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
              userId: MOCK_USER_ID, 
            } as Alert);
        }
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

const getOverallVehicleCompliance = (vehicle: Vehicle): 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'MissingInfo' => {
  if (!vehicle.documents || vehicle.documents.length === 0) return 'MissingInfo';
  
  let hasOverdue = false;
  let hasExpiringSoon = false;
  let hasMissingDocument = vehicle.documents.some(doc => getDocumentComplianceStatus(doc.expiryDate) === 'Missing');

  if (hasMissingDocument) return 'MissingInfo'; // If any doc is 'Missing', overall is 'MissingInfo'

  for (const doc of vehicle.documents) {
    const status = getDocumentComplianceStatus(doc.expiryDate);
    if (status === 'Overdue') hasOverdue = true;
    if (status === 'ExpiringSoon') hasExpiringSoon = true;
  }

  if (hasOverdue) return 'Overdue';
  if (hasExpiringSoon) return 'ExpiringSoon';
  return 'Compliant';
};


export async function getSummaryStats(): Promise<SummaryStats> {
  initializeDummyData();
  let compliantVehiclesCount = 0;
  let expiringSoonDocumentsCount = 0;
  let overdueDocumentsCount = 0;
  
  let expiringInsurance = 0;
  let overdueInsurance = 0;
  let expiringFitness = 0;
  let overdueFitness = 0;
  let expiringPUC = 0;
  let overduePUC = 0;
  let expiringAITP = 0;
  let overdueAITP = 0;

  let vehicleComplianceBreakdown: VehicleComplianceStatusBreakdown = {
    compliant: 0,
    expiringSoon: 0,
    overdue: 0,
    missingInfo: 0,
    total: 0,
  };
  
  const allVehicles = await getVehicles(); 
  vehicleComplianceBreakdown.total = allVehicles.length;

  allVehicles.forEach(vehicle => {
    const overallStatus = getOverallVehicleCompliance(vehicle);
    switch(overallStatus) {
      case 'Compliant': vehicleComplianceBreakdown.compliant++; break;
      case 'ExpiringSoon': vehicleComplianceBreakdown.expiringSoon++; break;
      case 'Overdue': vehicleComplianceBreakdown.overdue++; break;
      case 'MissingInfo': vehicleComplianceBreakdown.missingInfo++; break;
    }
    
    // Original document-level counts
    vehicle.documents.forEach(doc => {
      const currentStatus = getDocumentComplianceStatus(doc.expiryDate);
      
      if (currentStatus === 'ExpiringSoon') {
        expiringSoonDocumentsCount++;
        if (doc.type === 'Insurance') expiringInsurance++;
        if (doc.type === 'Fitness') expiringFitness++;
        if (doc.type === 'PUC') expiringPUC++;
        if (doc.type === 'AITP') expiringAITP++;
      }
      if (currentStatus === 'Overdue') {
        overdueDocumentsCount++;
        if (doc.type === 'Insurance') overdueInsurance++;
        if (doc.type === 'Fitness') overdueFitness++;
        if (doc.type === 'PUC') overduePUC++;
        if (doc.type === 'AITP') overdueAITP++;
      }
    });
  });
  // The definition of compliantVehicles in SummaryStats might slightly differ from the pie chart's "compliant"
  // SummaryStats.compliantVehicles counts vehicles where ALL documents are compliant (and not missing).
  // The pie chart "compliant" counts vehicles that are not Overdue and not ExpiringSoon.
  // For consistency, let's use the pie chart's definition for SummaryStats.compliantVehicles as well.
  compliantVehiclesCount = vehicleComplianceBreakdown.compliant;


  return {
    totalVehicles: allVehicles.length,
    compliantVehicles: compliantVehiclesCount, // Use the new breakdown
    expiringSoonDocuments: expiringSoonDocumentsCount,
    overdueDocuments: overdueDocumentsCount,
    expiringInsurance,
    overdueInsurance,
    expiringFitness,
    overdueFitness,
    expiringPUC,
    overduePUC,
    expiringAITP,
    overdueAITP,
    vehicleComplianceBreakdown // Add this for the chart
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
      const status = getDocumentComplianceStatus(doc.expiryDate);
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
            status: status, 
        });
      }
    });
  });
  // logAuditEvent('VIEW_REPORT', 'REPORT', undefined, { reportName: 'ExpiringDocuments', filters }); // Logging moved to component to capture client-side filters
  return reportableDocs.sort((a, b) => a.daysDifference - b.daysDifference);
}


export async function getCurrentUser(): Promise<User> {
  // const isAdmin = MOCK_USER_ID === "user_123_admin"; // Old check
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

export async function recordCsvExportAudit(reportName: string, format: string, filters: Record<string, any>) {
  logAuditEvent('EXPORT_REPORT', 'REPORT', undefined, {
    reportName,
    format,
    filtersApplied: filters, // Renamed for clarity in audit log
  });
}

initializeDummyData();

