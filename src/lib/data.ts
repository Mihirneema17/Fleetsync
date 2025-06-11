
import { db } from './firebase'; // Import Firestore instance
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp, // Firestore Timestamp
  writeBatch,
} from 'firebase/firestore';
import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, AuditLogEntry, AuditLogAction, DocumentType, UserRole, VehicleComplianceStatusBreakdown, ReportableDocument } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID, AI_SUPPORTED_DOCUMENT_TYPES, DATE_FORMAT, AUDIT_LOG_ACTIONS } from './constants';
import { format, formatISO, addDays, isBefore, parseISO, differenceInDays, isAfter } from 'date-fns';

// --- Helper Functions ---
const generateId = () => doc(collection(db, '_')).id; // Generate Firestore compatible ID

export const getDocumentComplianceStatus = (expiryDate: string | null): VehicleDocument['status'] => {
  if (!expiryDate || typeof expiryDate !== 'string' || expiryDate.trim() === '') return 'Missing';
  const now = new Date();
  const expDate = parseISO(expiryDate);
  expDate.setHours(23, 59, 59, 999); // Consider full day for expiry
  now.setHours(0,0,0,0); // Start of today

  if (isBefore(expDate, now)) return 'Overdue';
  // Check if expiry is today or in the future but within warning days
  if (differenceInDays(expDate, now) < EXPIRY_WARNING_DAYS) return 'ExpiringSoon';
  return 'Compliant';
};

export const getLatestDocumentForType = (vehicle: Vehicle, docType: DocumentType, customTypeName?: string): VehicleDocument | undefined => {
  const docsOfType = vehicle.documents.filter(d =>
      d.type === docType &&
      (docType !== 'Other' || d.customTypeName === customTypeName) &&
      d.expiryDate // Only consider documents with an expiry date as active
  );
  if (docsOfType.length === 0) return undefined;

  // Sort by expiry date (most future first), then by uploaded date (most recent first)
  docsOfType.sort((a, b) => {
      if (a.expiryDate && b.expiryDate) {
           const expiryDiff = parseISO(b.expiryDate).getTime() - parseISO(a.expiryDate).getTime();
           if (expiryDiff !== 0) return expiryDiff; // Primary sort: further expiry date first
      } else if (a.expiryDate) {
          return -1; // a has expiry, b doesn't, so a is "later"
      } else if (b.expiryDate) {
          return 1; // b has expiry, a doesn't, so b is "later"
      }
      // If expiry dates are same or both null, sort by uploadedAt descending
      return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
  });
  return docsOfType[0];
};

// For Firestore, it's better to log audit events directly to a collection
async function internalLogAuditEvent(
  action: AuditLogAction,
  entityType: AuditLogEntry['entityType'],
  entityId?: string,
  details: Record<string, any> = {},
  entityRegistration?: string
) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      timestamp: Timestamp.now(), // Use Firestore Timestamp
      userId: MOCK_USER_ID, // Replace with actual user ID when auth is implemented
      action,
      entityType,
      entityId,
      entityRegistration,
      details,
    });
  } catch (error) {
    console.error("Error logging audit event to Firestore:", error);
    // Fallback or further error handling
  }
}

// --- Data Operations (Refactored for Firestore) ---

export async function getVehicles(): Promise<Vehicle[]> {
  const vehiclesCol = collection(db, 'vehicles');
  const vehicleSnapshot = await getDocs(query(vehiclesCol, orderBy('registrationNumber')));
  const vehicleList = vehicleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle));
  return vehicleList;
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  const vehicleRef = doc(db, 'vehicles', id);
  const vehicleSnap = await getDoc(vehicleRef);
  if (vehicleSnap.exists()) {
    const vehicleData = { id: vehicleSnap.id, ...vehicleSnap.data() } as Vehicle;
    // Ensure documents array exists and is sorted (Firestore doesn't guarantee array order)
    vehicleData.documents = (vehicleData.documents || []).sort((a, b) => {
        if (a.type < b.type) return -1;
        if (a.type > b.type) return 1;
        if (a.type === 'Other' && b.type === 'Other') {
            const nameA = a.customTypeName || '';
            const nameB = b.customTypeName || '';
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
        }
        return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
    });
    return vehicleData;
  }
  return undefined;
}

export async function addVehicle(vehicleData: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>): Promise<Vehicle> {
  const now = Timestamp.now();
  const nowISO = formatISO(now.toDate());

  // Prepare initial 'Missing' documents. For Firestore, these will be part of the initial vehicle document.
  const initialDocuments: VehicleDocument[] = [];
  DOCUMENT_TYPES.forEach(docType => {
    if (docType !== 'Other') {
      initialDocuments.push({
        id: generateId(), // Client-side generated ID for the document object
        vehicleId: '', // Will be set after vehicle is created, though not strictly needed if embedded
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

  const newVehicleData = {
    ...vehicleData,
    documents: initialDocuments, // Embed initial documents
    createdAt: now, // Firestore Timestamp
    updatedAt: now, // Firestore Timestamp
  };

  const docRef = await addDoc(collection(db, 'vehicles'), newVehicleData);
  internalLogAuditEvent('CREATE_VEHICLE', 'VEHICLE', docRef.id, { registrationNumber: vehicleData.registrationNumber, make: vehicleData.make, model: vehicleData.model, type: vehicleData.type }, vehicleData.registrationNumber);
  
  // No need to call generateAlertsForVehicle here directly, alerts will be based on Firestore data
  
  return { ...newVehicleData, id: docRef.id, createdAt: nowISO, updatedAt: nowISO, documents: initialDocuments.map(d => ({...d, vehicleId: docRef.id})) };
}

export async function updateVehicle(id: string, updates: Partial<Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>>): Promise<Vehicle | undefined> {
  const vehicleRef = doc(db, 'vehicles', id);
  const vehicleSnap = await getDoc(vehicleRef);
  if (!vehicleSnap.exists()) return undefined;

  const oldVehicleData = vehicleSnap.data() as Omit<Vehicle, 'id'>;
  const updatedData = { ...updates, updatedAt: Timestamp.now() };
  await updateDoc(vehicleRef, updatedData);

  const changedFields: Record<string, any> = {};
    for (const key in updates) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
        const typedKey = key as keyof typeof updates;
        // Firestore data might need conversion for comparison (e.g., Timestamp to ISO string if oldData was from a different source)
        if (updates[typedKey] !== oldVehicleData[typedKey]) {
            changedFields[typedKey] = { old: oldVehicleData[typedKey], new: updates[typedKey] };
        }
        }
    }
  if (Object.keys(changedFields).length > 0) {
    internalLogAuditEvent('UPDATE_VEHICLE', 'VEHICLE', id, { updates: changedFields }, (oldVehicleData as Vehicle).registrationNumber);
  }
  // Alerts will be based on Firestore data, re-fetching might be needed or use real-time listeners later
  return getVehicleById(id); // Fetch the updated vehicle
}

export async function deleteVehicle(id: string): Promise<boolean> {
  const vehicleRef = doc(db, 'vehicles', id);
  const vehicleSnap = await getDoc(vehicleRef);
  if (!vehicleSnap.exists()) return false;

  const vehicleToDeleteData = vehicleSnap.data() as Vehicle; // To get registration number for audit log
  
  // Note: If documents were a subcollection, deleting them would require more complex logic (e.g., Cloud Function or batched writes).
  // Since they are currently an array field in the vehicle document, deleting the vehicle doc removes them.
  await deleteDoc(vehicleRef);
  
  // Delete associated alerts (if any)
  const alertsCol = collection(db, 'alerts');
  const q = query(alertsCol, where('vehicleId', '==', id));
  const alertSnapshot = await getDocs(q);
  const batch = writeBatch(db);
  alertSnapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  internalLogAuditEvent('DELETE_VEHICLE', 'VEHICLE', id, { registrationNumber: vehicleToDeleteData.registrationNumber }, vehicleToDeleteData.registrationNumber);
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
  const vehicleRef = doc(db, 'vehicles', vehicleId);
  const vehicleSnap = await getDoc(vehicleRef);
  if (!vehicleSnap.exists()) {
    console.error("Vehicle not found for adding document:", vehicleId);
    return undefined;
  }

  const vehicle = { id: vehicleSnap.id, ...vehicleSnap.data() } as Vehicle;
  let documents = vehicle.documents || [];

  const newDocId = generateId(); // Client-side unique ID for the document object within the array
  const status = getDocumentComplianceStatus(docData.expiryDate);
  const uploadedAtISO = formatISO(new Date());

  const newDocument: VehicleDocument = {
    id: newDocId,
    vehicleId: vehicleId,
    type: docData.type,
    customTypeName: docData.customTypeName,
    policyNumber: docData.policyNumber,
    startDate: docData.startDate,
    expiryDate: docData.expiryDate,
    documentUrl: docData.documentUrl,
    documentName: docData.documentName,
    status,
    uploadedAt: uploadedAtISO,
    aiExtractedPolicyNumber: docData.aiExtractedPolicyNumber,
    aiPolicyNumberConfidence: docData.aiPolicyNumberConfidence,
    aiExtractedStartDate: docData.aiExtractedStartDate,
    aiStartDateConfidence: docData.aiStartDateConfidence,
    aiExtractedDate: docData.aiExtractedDate,
    aiConfidence: docData.aiConfidence,
  };

  // Remove the 'Missing' placeholder if this new document effectively replaces it
  if (newDocument.expiryDate) {
      documents = documents.filter(d => 
          !(d.type === newDocument.type &&
           (d.type !== 'Other' || d.customTypeName === newDocument.customTypeName) &&
           d.status === 'Missing' && !d.expiryDate)
      );
  }
  
  documents.push(newDocument);
  
  // Sort documents before updating (optional, but good for consistency if displaying directly)
  documents.sort((a, b) => {
    if (a.type < b.type) return -1;
    if (a.type > b.type) return 1;
    return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
  });

  await updateDoc(vehicleRef, {
    documents: documents,
    updatedAt: Timestamp.now(),
  });

  internalLogAuditEvent('UPLOAD_DOCUMENT', 'DOCUMENT', newDocId, { /* details */ }, vehicle.registrationNumber);
  return getVehicleById(vehicleId); // Re-fetch to get the latest state
}


// --- Alerts --- (Will be refactored to read from Firestore)
async function generateAlertsForVehicle(vehicle: Vehicle) {
  // This function will now query Firestore for the vehicle's documents and then create/update alerts in the 'alerts' collection.
  // For simplicity in this phase, we'll focus on new alerts. Deleting old/resolved alerts needs careful handling.

  const alertsColRef = collection(db, "alerts");

  const uniqueDocTypesToConsider = new Set<string>();
  DOCUMENT_TYPES.forEach(dt => {
    if (dt === 'Other') {
      vehicle.documents
        .filter(d => d.type === 'Other' && d.customTypeName && d.expiryDate)
        .forEach(d => uniqueDocTypesToConsider.add(`Other:${d.customTypeName}`));
    } else {
       if (vehicle.documents.some(d => d.type === dt && d.expiryDate)) {
           uniqueDocTypesToConsider.add(dt);
       }
    }
  });

  for (const typeKey of uniqueDocTypesToConsider) {
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
        // Check if a similar unread alert already exists in Firestore
        const q = query(alertsColRef,
          where('vehicleId', '==', vehicle.id),
          where('documentType', '==', latestDoc.type),
          // where('customDocumentTypeName', '==', latestDoc.customDocumentTypeName), // tricky with undefined
          where('dueDate', '==', latestDoc.expiryDate),
          where('policyNumber', '==', latestDoc.policyNumber),
          where('userId', '==', MOCK_USER_ID),
          where('isRead', '==', false)
        );
        const existingAlertSnap = await getDocs(q);
        
        let effectivelyExists = false;
        if (!existingAlertSnap.empty) {
            existingAlertSnap.forEach(alertDoc => {
                const alertData = alertDoc.data();
                if (latestDoc.type !== 'Other' || alertData.customDocumentTypeName === latestDoc.customTypeName) {
                    effectivelyExists = true;
                }
            });
        }

        if (!effectivelyExists) {
          await addDoc(alertsColRef, {
            vehicleId: vehicle.id,
            vehicleRegistration: vehicle.registrationNumber,
            documentType: latestDoc.type,
            customDocumentTypeName: latestDoc.customTypeName,
            policyNumber: latestDoc.policyNumber,
            dueDate: latestDoc.expiryDate, // ISO date string
            message: `${latestDoc.type === 'Other' && latestDoc.customTypeName ? latestDoc.customTypeName : latestDoc.type} for ${vehicle.registrationNumber} is ${currentStatus === 'ExpiringSoon' ? `expiring on ${format(parseISO(latestDoc.expiryDate!), 'PPP')}` : `overdue since ${format(parseISO(latestDoc.expiryDate!), 'PPP')}`}.`,
            createdAt: Timestamp.now(),
            isRead: false,
            userId: MOCK_USER_ID,
          });
        }
      }
    }
  }
}

// This should be called sparingly, perhaps on app load or after major data changes.
// For now, individual add/update operations will call generateAlertsForVehicle.
export async function generateAllAlerts() {
  const allVehicles = await getVehicles(); // Fetch from Firestore
  for (const vehicle of allVehicles) {
    await generateAlertsForVehicle(vehicle);
  }
}


export async function getAlerts(onlyUnread: boolean = false): Promise<Alert[]> {
  const alertsColRef = collection(db, "alerts");
  let q = query(alertsColRef, where('userId', '==', MOCK_USER_ID), orderBy('createdAt', 'desc'));

  if (onlyUnread) {
    q = query(alertsColRef, where('userId', '==', MOCK_USER_ID), where('isRead', '==', false), orderBy('createdAt', 'desc'));
  }
  
  const alertSnapshot = await getDocs(q);
  return alertSnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      // Ensure Timestamps are converted to ISO strings if components expect that
      createdAt: (data.createdAt as Timestamp)?.toDate ? formatISO((data.createdAt as Timestamp).toDate()) : data.createdAt,
      // dueDate is already string
    } as Alert;
  });
}

export async function markAlertAsRead(alertId: string): Promise<boolean> {
  const alertRef = doc(db, 'alerts', alertId);
  // Optionally, you might want to verify the alert belongs to the current user before marking as read.
  try {
    await updateDoc(alertRef, { isRead: true });
    const alertSnap = await getDoc(alertRef); // Fetch to log details
    if (alertSnap.exists()) {
        const alertData = alertSnap.data();
        internalLogAuditEvent('MARK_ALERT_READ', 'ALERT', alertId, { documentType: alertData.documentType, vehicleRegistration: alertData.vehicleRegistration });
    }
    return true;
  } catch (error) {
    console.error("Error marking alert as read:", error);
    return false;
  }
}

// --- Summary Stats (Reads from Firestore, computes client-side for now) ---
export async function getSummaryStats(): Promise<SummaryStats> {
  const allVehicles = await getVehicles(); // Fetches from Firestore

  const vehicleComplianceBreakdown: VehicleComplianceStatusBreakdown = {
    compliant: 0, expiringSoon: 0, overdue: 0, missingInfo: 0, total: allVehicles.length,
  };
  let expiringSoonDocumentsCount = 0;
  let overdueDocumentsCount = 0;
  const docTypeCounts = {
    expiring: {} as Record<DocumentType | 'OtherCustom', number>,
    overdue: {} as Record<DocumentType | 'OtherCustom', number>,
  };
  DOCUMENT_TYPES.forEach(dt => { docTypeCounts.expiring[dt] = 0; docTypeCounts.overdue[dt] = 0; });
  docTypeCounts.expiring['OtherCustom'] = 0; docTypeCounts.overdue['OtherCustom'] = 0;

  allVehicles.forEach(vehicle => {
    const overallVehicleStatus = getOverallVehicleCompliance(vehicle); // This helper needs to work with Firestore data
    switch(overallVehicleStatus) {
      case 'Compliant': vehicleComplianceBreakdown.compliant++; break;
      case 'ExpiringSoon': vehicleComplianceBreakdown.expiringSoon++; break;
      case 'Overdue': vehicleComplianceBreakdown.overdue++; break;
      case 'MissingInfo': vehicleComplianceBreakdown.missingInfo++; break;
    }
    const uniqueActiveDocTypesInVehicle = new Set<string>();
     DOCUMENT_TYPES.forEach(dt => {
        if (dt === 'Other') {
            vehicle.documents.filter(d => d.type === 'Other' && d.customTypeName && d.expiryDate)
                             .forEach(d => uniqueActiveDocTypesInVehicle.add(`Other:${d.customTypeName}`));
        } else {
             if (vehicle.documents.some(d => d.type === dt && d.expiryDate)) {
                 uniqueActiveDocTypesInVehicle.add(dt);
             }
        }
    });

    uniqueActiveDocTypesInVehicle.forEach(typeKey => {
        const [docTypeForLookup, customTypeNameForLookup] = typeKey.startsWith('Other:')
            ? ['Other' as DocumentType, typeKey.split(':')[1]]
            : [typeKey as DocumentType, undefined];
        const latestDoc = getLatestDocumentForType(vehicle, docTypeForLookup, customTypeNameForLookup);
        if (latestDoc && latestDoc.expiryDate) {
            const status = getDocumentComplianceStatus(latestDoc.expiryDate);
            const countKey = latestDoc.type === 'Other' ? 'OtherCustom' : latestDoc.type;
            if (status === 'ExpiringSoon') {
                expiringSoonDocumentsCount++;
                if (docTypeCounts.expiring[countKey] !== undefined) docTypeCounts.expiring[countKey]++;
            } else if (status === 'Overdue') {
                overdueDocumentsCount++;
                if (docTypeCounts.overdue[countKey] !== undefined) docTypeCounts.overdue[countKey]++;
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

// Helper for getSummaryStats, adapted for Firestore data
export const getOverallVehicleCompliance = (vehicle: Vehicle): 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'MissingInfo' => {
  let isOverdue = false;
  let isExpiringSoon = false;
  const ESSENTIAL_DOC_TYPES: DocumentType[] = ['Insurance', 'Fitness', 'PUC'];
  let hasAllEssentialsWithExpiry = true;

  for (const essentialType of ESSENTIAL_DOC_TYPES) {
      const latestEssentialDoc = getLatestDocumentForType(vehicle, essentialType);
      if (!latestEssentialDoc || !latestEssentialDoc.expiryDate) {
          hasAllEssentialsWithExpiry = false;
          break;
      }
  }
  
  const activeDocs = vehicle.documents.filter(d => d.expiryDate);
  if (activeDocs.length === 0 && !hasAllEssentialsWithExpiry) { // No active docs and essentials are missing
    return 'MissingInfo';
  }


  for (const doc of activeDocs) {
    const status = getDocumentComplianceStatus(doc.expiryDate);
    if (status === 'Overdue') isOverdue = true;
    if (status === 'ExpiringSoon') isExpiringSoon = true;
  }

  if (isOverdue) return 'Overdue';
  if (isExpiringSoon) return 'ExpiringSoon';
  if (!hasAllEssentialsWithExpiry) return 'MissingInfo';
  return 'Compliant';
};


// --- Audit Logs (Refactored for Firestore) ---
export async function getAuditLogs(filters?: {
  userId?: string;
  entityType?: AuditLogEntry['entityType'];
  action?: AuditLogAction;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
}): Promise<AuditLogEntry[]> {
  const auditLogsColRef = collection(db, "auditLogs");
  let q = query(auditLogsColRef, orderBy('timestamp', 'desc')); // Base query

  const conditions: any[] = []; // Firebase query conditions array
  if (filters?.userId) conditions.push(where('userId', '==', filters.userId));
  if (filters?.entityType) conditions.push(where('entityType', '==', filters.entityType));
  if (filters?.action) conditions.push(where('action', '==', filters.action));
  if (filters?.dateFrom) {
    const fromDate = parseISO(filters.dateFrom);
    fromDate.setHours(0,0,0,0);
    conditions.push(where('timestamp', '>=', Timestamp.fromDate(fromDate)));
  }
  if (filters?.dateTo) {
    const toDate = parseISO(filters.dateTo);
    toDate.setHours(23,59,59,999);
    conditions.push(where('timestamp', '<=', Timestamp.fromDate(toDate)));
  }

  if (conditions.length > 0) {
    q = query(auditLogsColRef, ...conditions, orderBy('timestamp', 'desc'));
    // Note: Firestore requires an index for composite queries involving range filters and orderBy on different fields.
    // If you use dateFrom/dateTo along with other filters, you might need to create this index in Firebase console.
  }
  
  const auditSnapshot = await getDocs(q);
  return auditSnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      timestamp: formatISO((data.timestamp as Timestamp).toDate()), // Convert Firestore Timestamp to ISO string
    } as AuditLogEntry;
  });
}

export async function recordCsvExportAudit(reportName: string, formatUsed: string, filtersApplied: Record<string, any>) {
  await internalLogAuditEvent('EXPORT_REPORT', 'REPORT', undefined, {
    reportName,
    format: formatUsed,
    filtersApplied,
  });
}

// --- User Data (Placeholder, can be expanded with Firebase Auth) ---
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

// --- Reportable Documents (Reads from Firestore) ---
export async function getReportableDocuments(
  filters?: {
    statuses?: Array<'ExpiringSoon' | 'Overdue' | 'Compliant' | 'Missing'>,
    documentTypes?: DocumentType[]
  }
): Promise<ReportableDocument[]> {
  const allVehicles = await getVehicles(); // Fetches from Firestore
  const reportableDocs: ReportableDocument[] = [];
  const now = new Date();
  now.setHours(0,0,0,0);

  allVehicles.forEach(vehicle => {
    const latestActiveDocsMap = new Map<string, VehicleDocument>();
    (vehicle.documents || []).forEach(doc => {
      if (doc.expiryDate) {
        const typeKey = doc.type === 'Other' && doc.customTypeName ? `Other:${doc.customTypeName}` : doc.type;
        const existingLatest = latestActiveDocsMap.get(typeKey);
        if (!existingLatest || parseISO(doc.expiryDate!) > parseISO(existingLatest.expiryDate!) || 
            (parseISO(doc.expiryDate!).getTime() === parseISO(existingLatest.expiryDate!).getTime() && parseISO(doc.uploadedAt) > parseISO(existingLatest.uploadedAt))) {
          latestActiveDocsMap.set(typeKey, doc);
        }
      }
    });
    
    // Consider all defined document types for "Missing" status if not in latestActiveDocsMap
    DOCUMENT_TYPES.forEach(expectedDocType => {
        if (expectedDocType === 'Other') {
            // For 'Other', we only report what's present or specifically added as a placeholder.
            // It's hard to define "missing" for arbitrary custom types without explicit placeholders.
            const otherDocsInVehicle = (vehicle.documents || []).filter(d => d.type === 'Other' && d.customTypeName);
            const uniqueCustomTypes = Array.from(new Set(otherDocsInVehicle.map(d => d.customTypeName)));
            uniqueCustomTypes.forEach(customType => {
                if (customType && !latestActiveDocsMap.has(`Other:${customType}`)) {
                    // If an 'Other' document with this customType was once present but now has no active version
                    // (e.g. all expired and no new one), or if a placeholder for it exists.
                    // For simplicity, we'll only create 'Missing' reports for explicitly defined types for now.
                }
            });
        } else {
            if (!latestActiveDocsMap.has(expectedDocType)) {
                const status: VehicleDocument['status'] = 'Missing';
                let passesFilters = true;
                if (filters?.statuses && filters.statuses.length > 0 && !filters.statuses.includes(status)) passesFilters = false;
                if (filters?.documentTypes && filters.documentTypes.length > 0 && !filters.documentTypes.includes(expectedDocType)) passesFilters = false;
                
                if(passesFilters){
                     reportableDocs.push({
                        id: `${vehicle.id}_missing_${expectedDocType}`, 
                        vehicleId: vehicle.id,
                        type: expectedDocType,
                        status: status,
                        expiryDate: null, startDate: null, policyNumber: null,
                        uploadedAt: vehicle.createdAt, 
                        vehicleRegistration: vehicle.registrationNumber,
                        daysDifference: -Infinity, 
                    });
                }
            }
        }
    });


    latestActiveDocsMap.forEach(doc => {
      const status = getDocumentComplianceStatus(doc.expiryDate);
      let daysDiff = -Infinity;
      if (doc.expiryDate) {
        const expDate = parseISO(doc.expiryDate);
        expDate.setHours(23,59,59,999);
        daysDiff = differenceInDays(expDate, now);
      }
      let passesFilters = true;
      if (filters?.statuses && filters.statuses.length > 0 && !filters.statuses.includes(status)) passesFilters = false;
      if (filters?.documentTypes && filters.documentTypes.length > 0 && !filters.documentTypes.includes(doc.type)) passesFilters = false;

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
    const statusOrderValue = (s: ReportableDocument['status']) => ({ 'Overdue': 1, 'ExpiringSoon': 2, 'Compliant': 3, 'Missing': 4 }[s] || 5);
    const statusDiff = statusOrderValue(a.status) - statusOrderValue(b.status);
    if (statusDiff !== 0) return statusDiff;
    const daysDiffCompare = a.daysDifference - b.daysDifference;
    if (daysDiffCompare !== 0) return daysDiffCompare;
    return a.vehicleRegistration.localeCompare(b.vehicleRegistration);
  });
}
