
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
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID, DATE_FORMAT } from './constants';
import { format, formatISO, addDays, isBefore, parseISO, differenceInDays } from 'date-fns';
import { logger } from './logger'; // Import the logger
import { getDocumentComplianceStatus, getLatestDocumentForType } from './utils'; // Import from utils

// --- Helper Functions ---
const generateId = () => doc(collection(db, '_')).id; // Generate Firestore compatible ID

async function internalLogAuditEvent(
  action: AuditLogAction,
  entityType: AuditLogEntry['entityType'],
  entityId?: string,
  details: Record<string, any> = {},
  entityRegistration?: string
) {
  try {
    const newAuditLogId = generateId();
    // Ensure details object is cleaned of undefined values or stringify/parse to handle complex objects
    const cleanedDetails = JSON.parse(JSON.stringify(details, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value === undefined ? null : value;
    }));

    const auditLogData = {
      id: newAuditLogId,
      timestamp: Timestamp.now(),
      userId: MOCK_USER_ID,
      action,
      entityType,
      entityId: entityId === undefined ? null : entityId,
      entityRegistration: entityRegistration === undefined ? null : entityRegistration,
      details: cleanedDetails,
    };
    await addDoc(collection(db, 'auditLogs'), auditLogData);
    logger.info('Audit event logged successfully', { action, entityType, entityId });
  } catch (error) {
    logger.error("Error logging audit event to Firestore:", error, {action, entityType, entityId, details, entityRegistration});
  }
}

// --- Alerts ---
async function generateAlertsForVehicle(vehicle: Vehicle) {
  if (!vehicle || !vehicle.id) {
    logger.warn("generateAlertsForVehicle: Invalid vehicle object provided.", { vehicle });
    return;
  }
  logger.info(`Starting alert generation for vehicle ${vehicle.id}`);
  try {
    const alertsColRef = collection(db, "alerts");

    const existingUnreadAlertsQuery = query(alertsColRef,
      where('vehicleId', '==', vehicle.id),
      where('isRead', '==', false)
    );
    const existingUnreadAlertsSnap = await getDocs(existingUnreadAlertsQuery);
    const batch = writeBatch(db);
    existingUnreadAlertsSnap.forEach(alertDoc => {
        logger.debug(`Deleting existing unread alert ${alertDoc.id} for vehicle ${vehicle.id}`);
        batch.delete(alertDoc.ref);
    });
    await batch.commit();
    logger.info(`Cleared ${existingUnreadAlertsSnap.size} existing unread alerts for vehicle ${vehicle.id}`);

    const uniqueDocTypesToConsider = new Set<string>();
    (vehicle.documents || []).forEach(doc => {
      if (doc.expiryDate) {
        if (doc.type === 'Other' && doc.customTypeName) {
          uniqueDocTypesToConsider.add(`Other:${doc.customTypeName}`);
        } else if (doc.type !== 'Other') {
          uniqueDocTypesToConsider.add(doc.type);
        }
      }
    });

    logger.debug(`Unique document types to consider for alerts for vehicle ${vehicle.id}:`, Array.from(uniqueDocTypesToConsider));

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
          const newAlertId = generateId();
          const alertMessage = `${latestDoc.type === 'Other' && latestDoc.customTypeName ? latestDoc.customTypeName : latestDoc.type} for ${vehicle.registrationNumber} is ${currentStatus === 'ExpiringSoon' ? `expiring on ${format(parseISO(latestDoc.expiryDate!), 'PPP')}` : `overdue since ${format(parseISO(latestDoc.expiryDate!), 'PPP')}`}. (Policy: ${latestDoc.policyNumber || 'N/A'}, Uploaded: ${format(parseISO(latestDoc.uploadedAt), 'MMM dd, yyyy')})`;
          const newAlertData = {
            id: newAlertId,
            vehicleId: vehicle.id,
            vehicleRegistration: vehicle.registrationNumber,
            documentType: latestDoc.type,
            customDocumentTypeName: latestDoc.customTypeName,
            policyNumber: latestDoc.policyNumber,
            dueDate: latestDoc.expiryDate,
            message: alertMessage,
            createdAt: Timestamp.now(),
            isRead: false,
            userId: MOCK_USER_ID,
          };
          await addDoc(alertsColRef, newAlertData);
          logger.info(`Generated ${currentStatus} alert for vehicle ${vehicle.id}, doc type ${typeKey}`, { alertId: newAlertId });
        }
      }
    }
    logger.info(`Finished alert generation for vehicle ${vehicle.id}`);
  } catch (error) {
    logger.error(`Error during alert generation for vehicle ${vehicle.id}:`, error);
  }
}

export async function getAlerts(onlyUnread: boolean = false): Promise<Alert[]> {
  const alertsColRef = collection(db, "alerts");
  let qParams: any[] = [alertsColRef, where('userId', '==', MOCK_USER_ID)];

  if (onlyUnread) {
    qParams.push(where('isRead', '==', false));
  }
  qParams.push(orderBy('createdAt', 'desc'));

  const q = query.apply(null, qParams as any);

  const alertSnapshot = await getDocs(q);
  return alertSnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: (data.createdAt as Timestamp)?.toDate ? formatISO((data.createdAt as Timestamp).toDate()) : data.createdAt,
      dueDate: data.dueDate,
    } as Alert;
  });
}

export async function markAlertAsRead(alertId: string): Promise<boolean> {
  const alertRef = doc(db, 'alerts', alertId);
  try {
    await updateDoc(alertRef, { isRead: true });
    const alertSnap = await getDoc(alertRef);
    if (alertSnap.exists()) {
        const alertData = alertSnap.data();
        internalLogAuditEvent('MARK_ALERT_READ', 'ALERT', alertId, { documentType: alertData.documentType, vehicleRegistration: alertData.vehicleRegistration }, alertData.vehicleRegistration);
    }
    logger.info(`Alert ${alertId} marked as read.`);
    return true;
  } catch (error) {
    logger.error(`Error marking alert ${alertId} as read:`, error);
    return false;
  }
}


// --- Data Operations (Firestore) ---

export async function getVehicles(): Promise<Vehicle[]> {
  logger.debug('Fetching all vehicles...');
  const vehiclesCol = collection(db, 'vehicles');
  const vehicleSnapshot = await getDocs(query(vehiclesCol, orderBy('registrationNumber')));
  const vehicleList = vehicleSnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: (data.createdAt as Timestamp)?.toDate ? formatISO((data.createdAt as Timestamp).toDate()) : data.createdAt,
      updatedAt: (data.updatedAt as Timestamp)?.toDate ? formatISO((data.updatedAt as Timestamp).toDate()) : data.updatedAt,
      documents: (data.documents || []).map((doc: any) => ({
        ...doc,
        startDate: doc.startDate,
        expiryDate: doc.expiryDate,
        uploadedAt: doc.uploadedAt,
        aiExtractedDate: doc.aiExtractedDate,
        aiExtractedStartDate: doc.aiExtractedStartDate,
      })),
    } as Vehicle;
  });
  logger.info(`Fetched ${vehicleList.length} vehicles.`);
  return vehicleList;
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  logger.debug(`Fetching vehicle by ID: ${id}`);
  const vehicleRef = doc(db, 'vehicles', id);
  const vehicleSnap = await getDoc(vehicleRef);
  if (vehicleSnap.exists()) {
    const data = vehicleSnap.data();
    const vehicleData = {
      id: vehicleSnap.id,
      ...data,
      createdAt: (data.createdAt as Timestamp)?.toDate ? formatISO((data.createdAt as Timestamp).toDate()) : data.createdAt,
      updatedAt: (data.updatedAt as Timestamp)?.toDate ? formatISO((data.updatedAt as Timestamp).toDate()) : data.updatedAt,
      documents: (data.documents || []).map((doc: any) => ({
        ...doc,
        startDate: doc.startDate,
        expiryDate: doc.expiryDate,
        uploadedAt: doc.uploadedAt,
        aiExtractedDate: doc.aiExtractedDate,
        aiExtractedStartDate: doc.aiExtractedStartDate,
      })).sort((a: VehicleDocument, b: VehicleDocument) => {
        if (a.type < b.type) return -1;
        if (a.type > b.type) return 1;
        if (a.type === 'Other' && b.type === 'Other') {
            const nameA = a.customTypeName || '';
            const nameB = b.customTypeName || '';
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
        }
        return parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();
      }),
    } as Vehicle;
    logger.info(`Vehicle ${id} fetched successfully.`);
    return vehicleData;
  }
  logger.warn(`Vehicle with ID ${id} not found.`);
  return undefined;
}

export async function addVehicle(vehicleData: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>): Promise<Vehicle> {
  logger.info('Adding new vehicle:', { registrationNumber: vehicleData.registrationNumber });
  const now = Timestamp.now();
  const nowISO = formatISO(now.toDate());

  const initialDocuments: VehicleDocument[] = [];
  DOCUMENT_TYPES.forEach(docType => {
    if (docType !== 'Other') {
      initialDocuments.push({
        id: generateId(),
        vehicleId: '',
        type: docType,
        customTypeName: undefined,
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

  const newVehicleDataToStore = {
    ...vehicleData,
    documents: initialDocuments,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(collection(db, 'vehicles'), newVehicleDataToStore);
  logger.info(`Vehicle added successfully with ID: ${docRef.id}`);

  const newVehicleForReturn: Vehicle = {
    ...vehicleData,
    id: docRef.id,
    documents: initialDocuments.map(d => ({...d, vehicleId: docRef.id})),
    createdAt: nowISO,
    updatedAt: nowISO,
  };

  internalLogAuditEvent('CREATE_VEHICLE', 'VEHICLE', docRef.id, { ...vehicleData }, vehicleData.registrationNumber);

  // Fire-and-forget alert generation
  generateAlertsForVehicle(newVehicleForReturn)
    .then(() => logger.info(`Background alert generation initiated for new vehicle ${newVehicleForReturn.id}`))
    .catch(err => logger.error(`Background alert generation failed for new vehicle ${newVehicleForReturn.id}:`, err));

  return newVehicleForReturn;
}

export async function updateVehicle(id: string, updates: Partial<Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>>): Promise<Vehicle | undefined> {
  logger.info(`Updating vehicle ${id}:`, updates);
  const vehicleRef = doc(db, 'vehicles', id);
  const vehicleSnap = await getDoc(vehicleRef);
  if (!vehicleSnap.exists()) {
    logger.warn(`Update failed: Vehicle ${id} not found.`);
    return undefined;
  }

  const oldVehicleData = vehicleSnap.data() as Omit<Vehicle, 'id'>;
  const updatedDataToStore = { ...updates, updatedAt: Timestamp.now() };
  await updateDoc(vehicleRef, updatedDataToStore);
  logger.info(`Vehicle ${id} updated successfully.`);

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
    internalLogAuditEvent('UPDATE_VEHICLE', 'VEHICLE', id, { updates: changedFields }, (oldVehicleData as Vehicle).registrationNumber);
  }

  const updatedVehicle = await getVehicleById(id);
  if (updatedVehicle) {
    generateAlertsForVehicle(updatedVehicle)
      .then(() => logger.info(`Background alert generation initiated for updated vehicle ${updatedVehicle.id}`))
      .catch(err => logger.error(`Background alert generation failed for updated vehicle ${updatedVehicle.id}:`, err));
  }
  return updatedVehicle;
}

export async function deleteVehicle(id: string): Promise<boolean> {
  logger.info(`Attempting to delete vehicle ${id}`);
  const vehicleRef = doc(db, 'vehicles', id);
  const vehicleSnap = await getDoc(vehicleRef);
  if (!vehicleSnap.exists()) {
    logger.warn(`Delete failed: Vehicle ${id} not found.`);
    return false;
  }

  const vehicleToDeleteData = vehicleSnap.data() as Vehicle;

  await deleteDoc(vehicleRef);
  logger.info(`Vehicle ${id} deleted from 'vehicles' collection.`);

  const alertsCol = collection(db, 'alerts');
  const q = query(alertsCol, where('vehicleId', '==', id));
  const alertSnapshot = await getDocs(q);
  const batch = writeBatch(db);
  alertSnapshot.docs.forEach(docSnap => batch.delete(docSnap.ref));
  await batch.commit();
  logger.info(`Deleted ${alertSnapshot.size} alerts associated with vehicle ${id}.`);

  internalLogAuditEvent('DELETE_VEHICLE', 'VEHICLE', id, { registrationNumber: vehicleToDeleteData.registrationNumber }, vehicleToDeleteData.registrationNumber);
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
  logger.info(`Adding/updating document for vehicle ${vehicleId}:`, { type: docData.type, name: docData.documentName });
  const vehicleRef = doc(db, 'vehicles', vehicleId);
  const vehicleSnap = await getDoc(vehicleRef);
  if (!vehicleSnap.exists()) {
    logger.error(`Vehicle not found for adding document: ${vehicleId}`);
    return undefined;
  }

  const vehicle = { id: vehicleSnap.id, ...vehicleSnap.data() } as Vehicle;
  let documents = vehicle.documents || [];
  const newDocId = generateId();
  const status = getDocumentComplianceStatus(docData.expiryDate);
  const uploadedAtISO = formatISO(new Date());

  const newDocument: VehicleDocument = {
    id: newDocId,
    vehicleId: vehicleId,
    type: docData.type,
    customTypeName: docData.type === 'Other' ? docData.customTypeName : undefined,
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

  if (newDocument.expiryDate) {
      documents = documents.filter(d =>
          !(d.type === newDocument.type &&
           (d.type !== 'Other' || d.customTypeName === newDocument.customTypeName) &&
           d.status === 'Missing' && !d.expiryDate)
      );
  }
  documents.push(newDocument);

  documents.sort((a, b) => {
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

  await updateDoc(vehicleRef, {
    documents: documents,
    updatedAt: Timestamp.now(),
  });
  logger.info(`Document ${newDocId} added to vehicle ${vehicleId}.`);

  internalLogAuditEvent('UPLOAD_DOCUMENT', 'DOCUMENT', newDocId, {
      vehicleId: vehicleId,
      documentType: newDocument.type,
      customTypeName: newDocument.customTypeName,
      policyNumber: newDocument.policyNumber,
      expiryDate: newDocument.expiryDate,
      fileName: newDocument.documentName,
      aiPolicy: newDocument.aiExtractedPolicyNumber, aiPolicyConf: newDocument.aiPolicyNumberConfidence,
      aiStart: newDocument.aiExtractedStartDate, aiStartConf: newDocument.aiStartDateConfidence,
      aiExpiry: newDocument.aiExtractedDate, aiExpiryConf: newDocument.aiConfidence,
  }, vehicle.registrationNumber);

  const finalUpdatedVehicle = await getVehicleById(vehicleId);
  if (finalUpdatedVehicle) {
    generateAlertsForVehicle(finalUpdatedVehicle)
      .then(() => logger.info(`Background alert generation initiated for document update on vehicle ${finalUpdatedVehicle.id}`))
      .catch(err => logger.error(`Background alert generation failed for document update on vehicle ${finalUpdatedVehicle.id}:`, err));
  }
  return finalUpdatedVehicle;
}


// --- Summary Stats ---
export async function getSummaryStats(): Promise<SummaryStats> {
  const allVehicles = await getVehicles();

  const vehicleComplianceBreakdown: VehicleComplianceStatusBreakdown = {
    compliant: 0, expiringSoon: 0, overdue: 0, missingInfo: 0, total: allVehicles.length,
  };
  let expiringSoonDocumentsCount = 0;
  let overdueDocumentsCount = 0;

  const docTypeStatsTemplate: () => Record<DocumentType | 'OtherCustom', { expiring: number, overdue: number }> = () => ({
      Insurance: { expiring: 0, overdue: 0 },
      Fitness: { expiring: 0, overdue: 0 },
      PUC: { expiring: 0, overdue: 0 },
      AITP: { expiring: 0, overdue: 0 },
      Other: { expiring: 0, overdue: 0 },
      OtherCustom: { expiring: 0, overdue: 0 },
  });
  const docTypeCounts = docTypeStatsTemplate();


  allVehicles.forEach(vehicle => {
    const overallVehicleStatus = getOverallVehicleCompliance(vehicle);
    switch(overallVehicleStatus) {
      case 'Compliant': vehicleComplianceBreakdown.compliant++; break;
      case 'ExpiringSoon': vehicleComplianceBreakdown.expiringSoon++; break;
      case 'Overdue': vehicleComplianceBreakdown.overdue++; break;
      case 'MissingInfo': vehicleComplianceBreakdown.missingInfo++; break;
    }

    const uniqueActiveDocTypesInVehicle = new Set<string>();
     (vehicle.documents || []).forEach(doc => {
        if (doc.expiryDate) {
            if (doc.type === 'Other' && doc.customTypeName) {
                uniqueActiveDocTypesInVehicle.add(`Other:${doc.customTypeName}`);
            } else if (doc.type !== 'Other') {
                uniqueActiveDocTypesInVehicle.add(doc.type);
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
            const countKey = latestDoc.type === 'Other' && latestDoc.customTypeName ? 'OtherCustom' : latestDoc.type;

            if (status === 'ExpiringSoon') {
                expiringSoonDocumentsCount++;
                if (docTypeCounts[countKey as DocumentType | 'OtherCustom']) docTypeCounts[countKey as DocumentType | 'OtherCustom'].expiring++;
            } else if (status === 'Overdue') {
                overdueDocumentsCount++;
                 if (docTypeCounts[countKey as DocumentType | 'OtherCustom']) docTypeCounts[countKey as DocumentType | 'OtherCustom'].overdue++;
            }
        }
    });
  });
  return {
    totalVehicles: allVehicles.length,
    compliantVehicles: vehicleComplianceBreakdown.compliant,
    expiringSoonDocuments: expiringSoonDocumentsCount,
    overdueDocuments: overdueDocumentsCount,
    expiringInsurance: docTypeCounts['Insurance'].expiring,
    overdueInsurance: docTypeCounts['Insurance'].overdue,
    expiringFitness: docTypeCounts['Fitness'].expiring,
    overdueFitness: docTypeCounts['Fitness'].overdue,
    expiringPUC: docTypeCounts['PUC'].expiring,
    overduePUC: docTypeCounts['PUC'].overdue,
    expiringAITP: docTypeCounts['AITP'].expiring,
    overdueAITP: docTypeCounts['AITP'].overdue,
    vehicleComplianceBreakdown
  };
}

export const getOverallVehicleCompliance = (vehicle: Vehicle): 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'MissingInfo' => {
  let isOverdue = false;
  let isExpiringSoon = false;
  const ESSENTIAL_DOC_TYPES: DocumentType[] = ['Insurance', 'Fitness', 'PUC'];
  let hasAllEssentialsWithExpiry = true;
  let essentialDocsPresentAndActive = 0;

  for (const essentialType of ESSENTIAL_DOC_TYPES) {
      const latestEssentialDoc = getLatestDocumentForType(vehicle, essentialType);
      if (!latestEssentialDoc || !latestEssentialDoc.expiryDate) {
          hasAllEssentialsWithExpiry = false;
      } else {
        essentialDocsPresentAndActive++;
      }
  }

  const activeDocs = (vehicle.documents || []).filter(d => d.expiryDate);
  if (activeDocs.length === 0 && !hasAllEssentialsWithExpiry && essentialDocsPresentAndActive < ESSENTIAL_DOC_TYPES.length) {
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


// --- Audit Logs ---
export async function getAuditLogs(filters?: {
  userId?: string;
  entityType?: AuditLogEntry['entityType'];
  action?: AuditLogAction;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AuditLogEntry[]> {
  const auditLogsColRef = collection(db, "auditLogs");

  const queryConstraints: any[] = [orderBy('timestamp', 'desc')];
  if (filters?.userId) queryConstraints.unshift(where('userId', '==', filters.userId));
  if (filters?.entityType) queryConstraints.unshift(where('entityType', '==', filters.entityType));
  if (filters?.action) queryConstraints.unshift(where('action', '==', filters.action));

  if (filters?.dateFrom) {
    const fromDate = parseISO(filters.dateFrom);
    fromDate.setHours(0,0,0,0);
    queryConstraints.unshift(where('timestamp', '>=', Timestamp.fromDate(fromDate)));
  }
  if (filters?.dateTo) {
    const toDate = parseISO(filters.dateTo);
    toDate.setHours(23,59,59,999);
    queryConstraints.unshift(where('timestamp', '<=', Timestamp.fromDate(toDate)));
  }

  const q = query(auditLogsColRef, ...queryConstraints);

  const auditSnapshot = await getDocs(q);
  return auditSnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      timestamp: formatISO((data.timestamp as Timestamp).toDate()),
    } as AuditLogEntry;
  });
}

export async function recordCsvExportAudit(reportName: string, formatUsed: string, filtersApplied: Record<string, any>) {
  await internalLogAuditEvent('EXPORT_REPORT', 'REPORT', undefined, {
    reportName,
    format: formatUsed,
    filtersApplied: filtersApplied ? JSON.parse(JSON.stringify(filtersApplied, (key, value) => value instanceof Date ? value.toISOString() : value)) : {},
  });
}

// --- User Data ---
export async function getCurrentUser(): Promise<User> {
  const role: UserRole = MOCK_USER_ID.includes('_admin') ? 'admin' : MOCK_USER_ID.includes('_manager') ? 'manager' : 'viewer';
  // In a real app, this would fetch from auth or a users collection
  return {
    id: MOCK_USER_ID,
    name: role === 'admin' ? "Admin User" : role === 'manager' ? "Fleet Manager" : "Demo User",
    email: role === 'admin' ? "admin@example.com" : role === 'manager' ? "manager@example.com" : "user@example.com",
    avatarUrl: `https://placehold.co/100x100.png?text=${role === 'admin' ? 'AU' : role === 'manager' ? 'FM' : 'DU'}`,
    role: role
  };
}

// --- Reportable Documents ---
export async function getReportableDocuments(
  filters?: {
    statuses?: Array<'ExpiringSoon' | 'Overdue' | 'Compliant' | 'Missing'>,
    documentTypes?: DocumentType[]
  }
): Promise<ReportableDocument[]> {
  const allVehicles = await getVehicles();
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

    DOCUMENT_TYPES.forEach(expectedDocType => {
        if (expectedDocType === 'Other') {
            const otherDocsOfCustomTypes = (vehicle.documents || []).filter(d => d.type === 'Other' && d.customTypeName);
            const uniqueCustomNames = Array.from(new Set(otherDocsOfCustomTypes.map(d => d.customTypeName)));
            uniqueCustomNames.forEach(customName => {
                if (customName && !latestActiveDocsMap.has(`Other:${customName}`)) {
                    const allVersionsOfThisCustomType = otherDocsOfCustomTypes.filter(d => d.customTypeName === customName);
                    if (allVersionsOfThisCustomType.length > 0) {
                        const mostRecentVersion = allVersionsOfThisCustomType.sort((a,b) => parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime())[0];
                        const status = getDocumentComplianceStatus(mostRecentVersion.expiryDate);
                        let passesFilters = true;
                        if (filters?.statuses && filters.statuses.length > 0 && !filters.statuses.includes(status)) passesFilters = false;
                        if (filters?.documentTypes && filters.documentTypes.length > 0 && !filters.documentTypes.includes('Other')) passesFilters = false;

                        if (passesFilters) {
                            reportableDocs.push({
                                ...mostRecentVersion,
                                vehicleId: vehicle.id,
                                status: status,
                                vehicleRegistration: vehicle.registrationNumber,
                                daysDifference: mostRecentVersion.expiryDate ? differenceInDays(parseISO(mostRecentVersion.expiryDate), now) : -Infinity,
                            });
                        }
                    }
                }
            });
        } else {
            if (!latestActiveDocsMap.has(expectedDocType)) {
                const missingPlaceholder = (vehicle.documents || []).find(d => d.type === expectedDocType && d.status === 'Missing' && !d.expiryDate);
                if (missingPlaceholder) {
                     const status = 'Missing';
                     let passesFilters = true;
                     if (filters?.statuses && filters.statuses.length > 0 && !filters.statuses.includes(status)) passesFilters = false;
                     if (filters?.documentTypes && filters.documentTypes.length > 0 && !filters.documentTypes.includes(expectedDocType)) passesFilters = false;
                     if (passesFilters) {
                         reportableDocs.push({
                            ...missingPlaceholder,
                            vehicleId: vehicle.id,
                            status: status,
                            vehicleRegistration: vehicle.registrationNumber,
                            daysDifference: -Infinity,
                        });
                     }
                } else {
                    const allVersionsOfThisType = (vehicle.documents || []).filter(d => d.type === expectedDocType);
                    if (allVersionsOfThisType.length > 0 && allVersionsOfThisType.every(d => !d.expiryDate || getDocumentComplianceStatus(d.expiryDate) === 'Overdue')) {
                        const mostRecentVersion = allVersionsOfThisType.sort((a,b) => parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime())[0];
                         const status = 'Missing';
                         let passesFilters = true;
                         if (filters?.statuses && filters.statuses.length > 0 && !filters.statuses.includes(status)) passesFilters = false;
                         if (filters?.documentTypes && filters.documentTypes.length > 0 && !filters.documentTypes.includes(expectedDocType)) passesFilters = false;
                         if (passesFilters) {
                             reportableDocs.push({
                                ...mostRecentVersion,
                                vehicleId: vehicle.id,
                                status: status,
                                vehicleRegistration: vehicle.registrationNumber,
                                daysDifference: mostRecentVersion.expiryDate ? differenceInDays(parseISO(mostRecentVersion.expiryDate), now) : -Infinity,
                            });
                         }
                    }
                }
            }
        }
    });

    latestActiveDocsMap.forEach(doc => {
      const status = getDocumentComplianceStatus(doc.expiryDate);
      let daysDiff = -Infinity;
      if (doc.expiryDate) {
        const expDate = parseISO(doc.expiryDate);
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
    const statusOrderValue = (s: ReportableDocument['status']) => ({ 'Overdue': 1, 'ExpiringSoon': 2, 'Missing': 3, 'Compliant': 4 }[s] || 5);
    const statusDiff = statusOrderValue(a.status) - statusOrderValue(b.status);
    if (statusDiff !== 0) return statusDiff;

    let daysDiffCompare = 0;
    if(a.status === 'Compliant' && b.status === 'Compliant') {
        daysDiffCompare = b.daysDifference - a.daysDifference;
    } else {
        daysDiffCompare = a.daysDifference - b.daysDifference;
    }

    if (daysDiffCompare !== 0) return daysDiffCompare;
    return a.vehicleRegistration.localeCompare(b.vehicleRegistration);
  });
}

