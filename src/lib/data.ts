
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
  type QueryConstraint, // Import QueryConstraint
} from 'firebase/firestore';
import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, AuditLogEntry, AuditLogAction, DocumentType, UserRole, VehicleComplianceStatusBreakdown, ReportableDocument } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, MOCK_USER_ID, DATE_FORMAT } from './constants';
import { format, formatISO, addDays, isBefore, parseISO, differenceInDays } from 'date-fns';
import { logger } from './logger'; // Import the logger
import { getDocumentComplianceStatus, getLatestDocumentForType } from './utils'; // Import from utils

// Diagnostic check for db initialization
if (!db) {
  logger.error("[CRITICAL_DATA_INIT_FAILURE] Firestore 'db' instance is NOT initialized at the time of data.ts module evaluation. Firebase setup in firebase.ts likely failed catastrophically. Further Firestore operations will fail.");
  // Consider throwing an error here if this state should absolutely halt the server:
  // throw new Error("[CRITICAL_DATA_INIT_FAILURE] Firestore 'db' not available in data.ts.");
} else {
  logger.info("[DATA_INIT_SUCCESS] Firestore 'db' instance is confirmed available at data.ts module evaluation.");
}

// --- Helper Functions ---
const generateId = () => {
  if (!db) {
    // This case should ideally be prevented by the check above or by firebase.ts throwing.
    // However, as a last resort, log and throw if db is not available here.
    logger.error("generateId: Firestore 'db' instance is not initialized. Cannot generate ID.");
    throw new Error("Firestore 'db' instance not initialized for generateId.");
  }
  return doc(collection(db, '_')).id; // Generate Firestore compatible ID
}

async function internalLogAuditEvent(
  action: AuditLogAction,
  entityType: AuditLogEntry['entityType'],
  entityId?: string | null, // Allow null
  details: Record<string, any> = {},
  entityRegistration?: string | null // Allow null
) {
  if (!db) {
    logger.error("internalLogAuditEvent: Firestore 'db' instance is not initialized. Audit event cannot be logged.");
    return;
  }
  try {
    const newAuditLogId = generateId();
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
  if (!db) {
    logger.error("generateAlertsForVehicle: Firestore 'db' instance is not initialized. Alerts cannot be generated.");
    return;
  }
  if (!vehicle || !vehicle.id) {
    logger.warn("generateAlertsForVehicle: Invalid vehicle object provided.", { vehicle });
    return;
  }
  logger.info(`Starting alert generation for vehicle ${vehicle.id}`);
  try { // Wrap entire function for resilience
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

      if (latestDoc && latestDoc.expiryDate) { // Ensure expiryDate exists
        const currentStatus = getDocumentComplianceStatus(latestDoc.expiryDate);
        if (currentStatus === 'ExpiringSoon' || currentStatus === 'Overdue') {
          const newAlertId = generateId();
          const alertMessage = `${latestDoc.type === 'Other' && latestDoc.customTypeName ? latestDoc.customTypeName : latestDoc.type} for ${vehicle.registrationNumber} is ${currentStatus === 'ExpiringSoon' ? `expiring on ${format(parseISO(latestDoc.expiryDate), 'PPP')}` : `overdue since ${format(parseISO(latestDoc.expiryDate), 'PPP')}`}. (Policy: ${latestDoc.policyNumber || 'N/A'}, Uploaded: ${format(parseISO(latestDoc.uploadedAt), 'MMM dd, yyyy')})`;
          const newAlertData: Omit<Alert, 'id' | 'createdAt' | 'dueDate'> & { createdAt: Timestamp, dueDate: string } = { // Ensure types match Firestore
            vehicleId: vehicle.id,
            vehicleRegistration: vehicle.registrationNumber,
            documentType: latestDoc.type,
            customDocumentTypeName: latestDoc.customDocumentTypeName || null, // Ensure null
            policyNumber: latestDoc.policyNumber || null, // Ensure null
            dueDate: latestDoc.expiryDate, // Already a string
            message: alertMessage,
            createdAt: Timestamp.now(),
            isRead: false,
            userId: MOCK_USER_ID,
          };
          // Create a new document reference with the generated ID for the add operation.
          const alertDocRef = doc(collection(db, 'alerts'), newAlertId);
          await addDoc(alertsColRef, { id: newAlertId, ...newAlertData }); // Add id explicitly
          logger.info(`Generated ${currentStatus} alert for vehicle ${vehicle.id}, doc type ${typeKey}`, { alertId: newAlertId });
        }
      }
    }
    logger.info(`Finished alert generation for vehicle ${vehicle.id}`);
  } catch (error) {
    logger.error(`Critical error during alert generation for vehicle ${vehicle.id}:`, error);
    // Do not re-throw, allow main operation to continue
  }
}

export async function getAlerts(onlyUnread: boolean = false): Promise<Alert[]> {
  if (!db) {
    logger.error("[DATA] getAlerts: Firestore 'db' instance is not initialized. Cannot fetch alerts.");
    return [];
  }
  logger.info(`[DATA] getAlerts called. onlyUnread: ${onlyUnread}`);
  try {
    const alertsColRef = collection(db, "alerts");
    const queryConstraints: QueryConstraint[] = [
      orderBy('createdAt', 'desc')
    ];

    if (onlyUnread) {
      queryConstraints.unshift(where('isRead', '==', false));
      // This userId filter is crucial for matching the composite index
      queryConstraints.unshift(where('userId', '==', MOCK_USER_ID));
    } else {
      // If not filtering by isRead, we still need userId for consistency if other queries rely on it or for general scoping
      queryConstraints.unshift(where('userId', '==', MOCK_USER_ID));
    }


    const q = query(alertsColRef, ...queryConstraints);
    const alertSnapshot = await getDocs(q);
    logger.info(`[DATA] getAlerts fetched ${alertSnapshot.docs.length} alerts.`);

    return alertSnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        vehicleId: data.vehicleId || '',
        vehicleRegistration: data.vehicleRegistration || '',
        documentType: data.documentType || 'Other',
        customDocumentTypeName: data.customDocumentTypeName || undefined,
        dueDate: data.dueDate, // Assuming dueDate is already a string
        message: data.message || '',
        createdAt: (data.createdAt as Timestamp)?.toDate ? formatISO((data.createdAt as Timestamp).toDate()) : new Date(0).toISOString(),
        isRead: data.isRead || false,
        userId: data.userId || MOCK_USER_ID,
        policyNumber: data.policyNumber || null,
      } as Alert;
    });
  } catch (error) {
    logger.error('[DATA] Error fetching alerts from Firestore:', error);
    return []; // Return empty array on error
  }
}

export async function markAlertAsRead(alertId: string): Promise<boolean> {
  if (!db) {
    logger.error("markAlertAsRead: Firestore 'db' instance is not initialized. Cannot mark alert.");
    return false;
  }
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
  if (!db) {
    logger.error("getVehicles: Firestore 'db' instance is not initialized. Cannot fetch vehicles.");
    return [];
  }
  logger.debug('Fetching all vehicles...');
  try {
    const vehiclesCol = collection(db, 'vehicles');
    const vehicleSnapshot = await getDocs(query(vehiclesCol, orderBy('registrationNumber')));
    const vehicleList = vehicleSnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        registrationNumber: data.registrationNumber || '',
        type: data.type || 'Unknown',
        make: data.make || 'Unknown',
        model: data.model || 'Unknown',
        createdAt: (data.createdAt as Timestamp)?.toDate ? formatISO((data.createdAt as Timestamp).toDate()) : new Date(0).toISOString(),
        updatedAt: (data.updatedAt as Timestamp)?.toDate ? formatISO((data.updatedAt as Timestamp).toDate()) : new Date(0).toISOString(),
        documents: (data.documents || []).map((doc: any) => ({
          id: doc.id || generateId(),
          vehicleId: doc.vehicleId || docSnap.id,
          type: doc.type || 'Other',
          customTypeName: doc.customTypeName || null,
          policyNumber: doc.policyNumber || null,
          startDate: doc.startDate || null,
          expiryDate: doc.expiryDate || null,
          status: doc.status || 'Missing',
          uploadedAt: doc.uploadedAt || new Date(0).toISOString(),
          documentName: doc.documentName || null,
          documentUrl: doc.documentUrl || null,
          aiExtractedPolicyNumber: doc.aiExtractedPolicyNumber || null,
          aiPolicyNumberConfidence: doc.aiPolicyNumberConfidence || null,
          aiExtractedStartDate: doc.aiExtractedStartDate || null,
          aiStartDateConfidence: doc.aiStartDateConfidence || null,
          aiExtractedDate: doc.aiExtractedDate || null,
          aiConfidence: doc.aiConfidence || null,
        })),
      } as Vehicle;
    });
    logger.info(`Fetched ${vehicleList.length} vehicles.`);
    return vehicleList;
  } catch (error) {
    logger.error('Error fetching vehicles:', error);
    return [];
  }
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  if (!db) {
    logger.error(`getVehicleById: Firestore 'db' instance is not initialized. Cannot fetch vehicle ${id}.`);
    return undefined;
  }
  logger.debug(`Fetching vehicle by ID: ${id}`);
  try {
    const vehicleRef = doc(db, 'vehicles', id);
    const vehicleSnap = await getDoc(vehicleRef);
    if (vehicleSnap.exists()) {
      const data = vehicleSnap.data();
      const vehicleData = {
        id: vehicleSnap.id,
        registrationNumber: data.registrationNumber || '',
        type: data.type || 'Unknown',
        make: data.make || 'Unknown',
        model: data.model || 'Unknown',
        createdAt: (data.createdAt as Timestamp)?.toDate ? formatISO((data.createdAt as Timestamp).toDate()) : new Date(0).toISOString(),
        updatedAt: (data.updatedAt as Timestamp)?.toDate ? formatISO((data.updatedAt as Timestamp).toDate()) : new Date(0).toISOString(),
        documents: (data.documents || []).map((doc: any) => ({
          id: doc.id || generateId(),
          vehicleId: doc.vehicleId || vehicleSnap.id,
          type: doc.type || 'Other',
          customTypeName: doc.customTypeName || null,
          policyNumber: doc.policyNumber || null,
          startDate: doc.startDate || null,
          expiryDate: doc.expiryDate || null,
          status: doc.status || 'Missing',
          uploadedAt: doc.uploadedAt || new Date(0).toISOString(),
          documentName: doc.documentName || null,
          documentUrl: doc.documentUrl || null,
          aiExtractedPolicyNumber: doc.aiExtractedPolicyNumber || null,
          aiPolicyNumberConfidence: doc.aiPolicyNumberConfidence || null,
          aiExtractedStartDate: doc.aiExtractedStartDate || null,
          aiStartDateConfidence: doc.aiStartDateConfidence || null,
          aiExtractedDate: doc.aiExtractedDate || null,
          aiConfidence: doc.aiConfidence || null,
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
  } catch (error) {
    logger.error(`Error fetching vehicle by ID ${id}:`, error);
    return undefined;
  }
}

export async function addVehicle(vehicleData: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>): Promise<Vehicle> {
  if (!db) {
    const errorMsg = "addVehicle: Firestore 'db' instance is not initialized. Cannot add vehicle.";
    logger.error(errorMsg, { vehicleData });
    throw new Error(errorMsg);
  }
  logger.info('Adding new vehicle:', { registrationNumber: vehicleData.registrationNumber });
  const now = Timestamp.now();
  const nowISO = formatISO(now.toDate());

  try {
    const initialDocuments: VehicleDocument[] = [];
    DOCUMENT_TYPES.forEach(docType => {
      if (docType !== 'Other') { // Only create placeholders for non-'Other' types
        initialDocuments.push({
          id: generateId(),
          vehicleId: '', // Will be updated
          type: docType,
          customTypeName: null, // Explicitly null
          policyNumber: null,   // Explicitly null
          startDate: null,      // Explicitly null
          expiryDate: null,     // Explicitly null
          status: 'Missing',
          uploadedAt: nowISO,
          documentName: null,   // Explicitly null
          documentUrl: null,    // Explicitly null
          // AI fields explicitly null
          aiExtractedPolicyNumber: null,
          aiPolicyNumberConfidence: null,
          aiExtractedStartDate: null,
          aiStartDateConfidence: null,
          aiExtractedDate: null,
          aiConfidence: null,
        });
      }
    });

    const newVehicleDataToStore = {
      ...vehicleData,
      documents: initialDocuments, // These initially have empty vehicleId
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await addDoc(collection(db, 'vehicles'), newVehicleDataToStore);
    logger.info(`Vehicle added successfully with ID: ${docRef.id}`);

    const finalInitialDocuments = initialDocuments.map(d => ({...d, vehicleId: docRef.id}));
    await updateDoc(docRef, { documents: finalInitialDocuments });
    logger.info(`Initial documents updated with vehicleId for ${docRef.id}`);

    const newVehicleForReturn: Vehicle = {
      ...vehicleData,
      id: docRef.id,
      documents: finalInitialDocuments,
      createdAt: nowISO,
      updatedAt: nowISO,
    };

    internalLogAuditEvent('CREATE_VEHICLE', 'VEHICLE', docRef.id, { ...vehicleData }, vehicleData.registrationNumber);

    generateAlertsForVehicle(newVehicleForReturn)
      .then(() => logger.info(`Background alert generation initiated for new vehicle ${newVehicleForReturn.id}`))
      .catch(err => logger.error(`Background alert generation failed for new vehicle ${newVehicleForReturn.id}:`, err));

    return newVehicleForReturn;
  } catch (error) {
    logger.error('Error during addVehicle core logic:', error, { vehicleData });
    throw error; // Re-throw so the Server Action catches it
  }
}

export async function updateVehicle(id: string, updates: Partial<Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>>): Promise<Vehicle | undefined> {
  if (!db) {
    logger.error(`updateVehicle: Firestore 'db' instance is not initialized. Cannot update vehicle ${id}.`);
    return undefined;
  }
  logger.info(`Updating vehicle ${id}:`, updates);
  try {
    const vehicleRef = doc(db, 'vehicles', id);
    const vehicleSnap = await getDoc(vehicleRef);
    if (!vehicleSnap.exists()) {
      logger.warn(`Update failed: Vehicle ${id} not found.`);
      return undefined;
    }

    const oldVehicleData = vehicleSnap.data() as Omit<Vehicle, 'id'>; // Assuming Vehicle type structure
    const updatedDataToStore = { ...updates, updatedAt: Timestamp.now() };
    await updateDoc(vehicleRef, updatedDataToStore);
    logger.info(`Vehicle ${id} updated successfully.`);

    const changedFields: Record<string, any> = {};
    for (const key in updates) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        const typedKey = key as keyof typeof updates;
        const oldValue = oldVehicleData[typedKey] !== undefined ? oldVehicleData[typedKey] : null;
        const newValue = updates[typedKey] !== undefined ? updates[typedKey] : null;
        if (newValue !== oldValue) {
          changedFields[typedKey] = { old: oldValue, new: newValue };
        }
      }
    }

    if (Object.keys(changedFields).length > 0) {
      const currentRegNumber = updates.registrationNumber || (oldVehicleData as Vehicle).registrationNumber;
      internalLogAuditEvent('UPDATE_VEHICLE', 'VEHICLE', id, { updates: changedFields }, currentRegNumber);
    }

    const updatedVehicle = await getVehicleById(id);
    if (updatedVehicle) {
      generateAlertsForVehicle(updatedVehicle)
        .then(() => logger.info(`Background alert generation initiated for updated vehicle ${updatedVehicle.id}`))
        .catch(err => logger.error(`Background alert generation failed for updated vehicle ${updatedVehicle.id}:`, err));
    }
    return updatedVehicle;
  } catch (error) {
    logger.error(`Error updating vehicle ${id}:`, error, { updates });
    return undefined; // Or re-throw if the caller should handle it
  }
}

export async function deleteVehicle(id: string): Promise<boolean> {
  if (!db) {
    logger.error(`deleteVehicle: Firestore 'db' instance is not initialized. Cannot delete vehicle ${id}.`);
    return false;
  }
  logger.info(`Attempting to delete vehicle ${id}`);
  try {
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
  } catch (error) {
    logger.error(`Error deleting vehicle ${id}:`, error);
    return false;
  }
}

export async function addOrUpdateDocument(
  vehicleId: string,
  docData: {
    type: DocumentType;
    customTypeName?: string | null;
    policyNumber?: string | null;
    startDate?: string | null;
    expiryDate: string | null; // Should always be string here
    documentName?: string | null;
    documentUrl?: string | null;
    aiExtractedPolicyNumber?: string | null;
    aiPolicyNumberConfidence?: number | null;
    aiExtractedStartDate?: string | null;
    aiStartDateConfidence?: number | null;
    aiExtractedDate?: string | null; // This is for expiryDate
    aiConfidence?: number | null;   // This is for expiryDateConfidence
  }
): Promise<Vehicle | undefined> {
  if (!db) {
    logger.error(`addOrUpdateDocument: Firestore 'db' instance is not initialized. Cannot process document for vehicle ${vehicleId}.`);
    return undefined;
  }
  logger.info(`Adding/updating document for vehicle ${vehicleId}:`, { type: docData.type, name: docData.documentName });
  try {
    const vehicleRef = doc(db, 'vehicles', vehicleId);
    const vehicleSnap = await getDoc(vehicleRef);
    if (!vehicleSnap.exists()) {
      logger.error(`Vehicle not found for adding document: ${vehicleId}`);
      return undefined;
    }

    const vehicle = { id: vehicleSnap.id, ...vehicleSnap.data() } as Vehicle;
    let documents = vehicle.documents || [];
    const newDocId = generateId();
    // expiryDate from docData is already a string | null, but form validation should ensure it's not null here
    const status = getDocumentComplianceStatus(docData.expiryDate as string);
    const uploadedAtISO = formatISO(new Date());

    const newDocument: VehicleDocument = {
      id: newDocId,
      vehicleId: vehicleId,
      type: docData.type,
      customTypeName: docData.type === 'Other' ? (docData.customTypeName || null) : null,
      policyNumber: docData.policyNumber || null,
      startDate: docData.startDate || null,
      expiryDate: docData.expiryDate as string, // Cast as string, form ensures it's present
      documentUrl: docData.documentUrl || null,
      documentName: docData.documentName || null,
      status,
      uploadedAt: uploadedAtISO,
      aiExtractedPolicyNumber: docData.aiExtractedPolicyNumber || null,
      aiPolicyNumberConfidence: docData.aiPolicyNumberConfidence === undefined ? null : docData.aiPolicyNumberConfidence,
      aiExtractedStartDate: docData.aiExtractedStartDate || null,
      aiStartDateConfidence: docData.aiStartDateConfidence === undefined ? null : docData.aiStartDateConfidence,
      aiExtractedDate: docData.aiExtractedDate || null,
      aiConfidence: docData.aiConfidence === undefined ? null : docData.aiConfidence,
    };

    // Remove placeholder "Missing" document if this new document is for the same type
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
  } catch (error) {
    logger.error(`Error adding/updating document for vehicle ${vehicleId}:`, error, { docDataType: docData.type });
    return undefined;
  }
}


// --- Summary Stats ---
export async function getSummaryStats(): Promise<SummaryStats> {
  if (!db) {
    logger.error("[DATA] getSummaryStats: Firestore 'db' instance is not initialized. Cannot generate stats.");
    // Return a default/empty SummaryStats object to prevent crashes
    return {
      totalVehicles: 0, compliantVehicles: 0, expiringSoonDocuments: 0, overdueDocuments: 0,
      expiringInsurance: 0, overdueInsurance: 0, expiringFitness: 0, overdueFitness: 0,
      expiringPUC: 0, overduePUC: 0, expiringAITP: 0, overdueAITP: 0,
      vehicleComplianceBreakdown: { compliant: 0, expiringSoon: 0, overdue: 0, missingInfo: 0, total: 0 },
    };
  }
  logger.info('[DATA] getSummaryStats called');
  try {
    const allVehicles = await getVehicles(); // This itself has try-catch

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
        Other: { expiring: 0, overdue: 0 }, // For generic 'Other' type if no custom name
        OtherCustom: { expiring: 0, overdue: 0 }, // For specific 'Other' with custom name
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
          if (doc.expiryDate) { // Only consider active documents with an expiry date
              if (doc.type === 'Other' && doc.customTypeName) {
                  uniqueActiveDocTypesInVehicle.add(`Other:${doc.customTypeName}`);
              } else if (doc.type !== 'Other') {
                  uniqueActiveDocTypesInVehicle.add(doc.type);
              } else { // 'Other' type without a custom name
                  uniqueActiveDocTypesInVehicle.add('Other:GENERIC'); // Use a special key for generic Others
              }
          }
      });

      uniqueActiveDocTypesInVehicle.forEach(typeKey => {
          let docTypeForLookup: DocumentType;
          let customTypeNameForLookup: string | undefined;

          if (typeKey.startsWith('Other:')) {
              docTypeForLookup = 'Other';
              customTypeNameForLookup = typeKey.substring(6) === 'GENERIC' ? undefined : typeKey.substring(6);
          } else {
              docTypeForLookup = typeKey as DocumentType;
          }

          const latestDoc = getLatestDocumentForType(vehicle, docTypeForLookup, customTypeNameForLookup);
          if (latestDoc && latestDoc.expiryDate) {
              const status = getDocumentComplianceStatus(latestDoc.expiryDate);

              // Determine which key to use in docTypeCounts
              let countKey: DocumentType | 'OtherCustom' = latestDoc.type;
              if (latestDoc.type === 'Other') {
                countKey = latestDoc.customTypeName ? 'OtherCustom' : 'Other';
              }

              if (status === 'ExpiringSoon') {
                  expiringSoonDocumentsCount++;
                  if (docTypeCounts[countKey]) docTypeCounts[countKey].expiring++;
              } else if (status === 'Overdue') {
                  overdueDocumentsCount++;
                   if (docTypeCounts[countKey]) docTypeCounts[countKey].overdue++;
              }
          }
      });
    });

    const resultSummary: SummaryStats = {
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
    logger.info('[DATA] getSummaryStats successfully computed and returning', { summary: resultSummary });
    return resultSummary;
  } catch (error) {
    logger.error('[DATA] Error in getSummaryStats:', error);
    // Return a default/empty SummaryStats object to prevent crashes
    return {
      totalVehicles: 0,
      compliantVehicles: 0,
      expiringSoonDocuments: 0,
      overdueDocuments: 0,
      expiringInsurance: 0,
      overdueInsurance: 0,
      expiringFitness: 0,
      overdueFitness: 0,
      expiringPUC: 0,
      overduePUC: 0,
      expiringAITP: 0,
      overdueAITP: 0,
      vehicleComplianceBreakdown: { compliant: 0, expiringSoon: 0, overdue: 0, missingInfo: 0, total: 0 },
    };
  }
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

  // Consider "active" documents as those with an expiry date.
  const activeDocs = (vehicle.documents || []).filter(d => d.expiryDate);

  // If there are no documents with expiry dates AND not all essential types are covered, it's MissingInfo.
  if (activeDocs.length === 0 && essentialDocsPresentAndActive < ESSENTIAL_DOC_TYPES.length) {
    return 'MissingInfo';
  }

  // Iterate through active documents to check for Overdue or ExpiringSoon.
  for (const doc of activeDocs) {
    if (doc.expiryDate) { // Should always be true due to filter above, but good for safety
      const status = getDocumentComplianceStatus(doc.expiryDate);
      if (status === 'Overdue') isOverdue = true;
      if (status === 'ExpiringSoon') isExpiringSoon = true;
    }
  }

  if (isOverdue) return 'Overdue';
  if (isExpiringSoon) return 'ExpiringSoon';
  // If not all essential documents have an expiry date, it's MissingInfo.
  if (!hasAllEssentialsWithExpiry && essentialDocsPresentAndActive < ESSENTIAL_DOC_TYPES.length) return 'MissingInfo';
  return 'Compliant';
};


// --- Audit Logs ---
export async function getAuditLogs(filters?: {
  userId?: string;
  entityType?: AuditLogEntry['entityType'];
  action?: AuditLogAction;
  dateFrom?: string; // ISO Date string yyyy-MM-dd
  dateTo?: string;   // ISO Date string yyyy-MM-dd
}): Promise<AuditLogEntry[]> {
  if (!db) {
    logger.error("getAuditLogs: Firestore 'db' instance is not initialized. Cannot fetch audit logs.");
    return [];
  }
  try {
    const auditLogsColRef = collection(db, "auditLogs");
    const queryConstraints: QueryConstraint[] = [orderBy('timestamp', 'desc')]; // Default sort

    if (filters?.userId) queryConstraints.unshift(where('userId', '==', filters.userId));
    if (filters?.entityType) queryConstraints.unshift(where('entityType', '==', filters.entityType));
    if (filters?.action) queryConstraints.unshift(where('action', '==', filters.action));

    if (filters?.dateFrom) {
      const fromDate = parseISO(filters.dateFrom); // Assuming yyyy-MM-dd
      fromDate.setHours(0,0,0,0); // Start of day
      queryConstraints.unshift(where('timestamp', '>=', Timestamp.fromDate(fromDate)));
    }
    if (filters?.dateTo) {
      const toDate = parseISO(filters.dateTo); // Assuming yyyy-MM-dd
      toDate.setHours(23,59,59,999); // End of day
      queryConstraints.unshift(where('timestamp', '<=', Timestamp.fromDate(toDate)));
    }

    const q = query(auditLogsColRef, ...queryConstraints);
    const auditSnapshot = await getDocs(q);

    return auditSnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        timestamp: formatISO((data.timestamp as Timestamp).toDate()), // Ensure ISO string
        userId: data.userId || '',
        action: data.action || 'UNKNOWN_ACTION',
        entityType: data.entityType || 'UNKNOWN_ENTITY',
        entityId: data.entityId || null,
        entityRegistration: data.entityRegistration || null,
        details: data.details || {},
      } as AuditLogEntry;
    });
  } catch (error) {
    logger.error('Error fetching audit logs:', error, { filters });
    return [];
  }
}

export async function recordCsvExportAudit(reportName: string, formatUsed: string, filtersApplied: Record<string, any>) {
  if (!db) {
    logger.error("recordCsvExportAudit: Firestore 'db' instance is not initialized. Cannot record audit for CSV export.");
    return;
  }
  await internalLogAuditEvent('EXPORT_REPORT', 'REPORT', undefined, {
    reportName,
    format: formatUsed,
    filtersApplied: filtersApplied ? JSON.parse(JSON.stringify(filtersApplied, (key, value) => value instanceof Date ? value.toISOString() : value)) : {},
  });
}

// --- User Data ---
export async function getCurrentUser(): Promise<User | null> {
  // This is a mock. In a real app, this would fetch from auth or a users collection.
  logger.info('[DATA] getCurrentUser called');
  try {
    const role: UserRole = MOCK_USER_ID.includes('_admin') ? 'admin' : MOCK_USER_ID.includes('_manager') ? 'manager' : 'viewer';
    const user: User = {
      id: MOCK_USER_ID,
      name: role === 'admin' ? "Admin User" : role === 'manager' ? "Fleet Manager" : "Demo User",
      email: role === 'admin' ? "admin@example.com" : role === 'manager' ? "manager@example.com" : "user@example.com",
      avatarUrl: `https://placehold.co/100x100.png?text=${role === 'admin' ? 'AU' : role === 'manager' ? 'FM' : 'DU'}`,
      role: role
    };
    logger.info('[DATA] getCurrentUser returning mock user', { userId: user.id, role: user.role });
    return user;
  } catch (error) {
      logger.error('[DATA] Error in getCurrentUser (mock implementation):', error);
      return null;
  }
}

// --- Reportable Documents ---
export async function getReportableDocuments(
  filters?: {
    statuses?: Array<'ExpiringSoon' | 'Overdue' | 'Compliant' | 'Missing'>,
    documentTypes?: DocumentType[]
  }
): Promise<ReportableDocument[]> {
  if (!db) {
    logger.error("getReportableDocuments: Firestore 'db' instance is not initialized. Cannot fetch reportable documents.");
    return [];
  }
  logger.info('Fetching reportable documents with filters:', { filters });
  try {
    const allVehicles = await getVehicles();
    const reportableDocs: ReportableDocument[] = [];
    const now = new Date();
    now.setHours(0,0,0,0); // For consistent day comparison

    allVehicles.forEach(vehicle => {
      const latestActiveDocsMap = new Map<string, VehicleDocument>();

      // Populate latestActiveDocsMap with the latest version of each document type that has an expiry date
      (vehicle.documents || []).forEach(doc => {
        if (doc.expiryDate) { // Only consider docs with expiry dates as potentially "active"
          const typeKey = doc.type === 'Other' && doc.customTypeName ? `Other:${doc.customTypeName}` : doc.type;
          const existingLatest = latestActiveDocsMap.get(typeKey);
          if (!existingLatest ||
              parseISO(doc.expiryDate) > parseISO(existingLatest.expiryDate!) ||
              (parseISO(doc.expiryDate).getTime() === parseISO(existingLatest.expiryDate!).getTime() && parseISO(doc.uploadedAt) > parseISO(existingLatest.uploadedAt))) {
            latestActiveDocsMap.set(typeKey, doc);
          }
        }
      });

      // Process expected document types to find active ones or create "Missing" entries
      const allExpectedDocTypeKeys = new Set<string>(DOCUMENT_TYPES.filter(dt => dt !== 'Other'));
      (vehicle.documents || []).forEach(doc => { // Add any 'Other' custom types from vehicle documents
          if (doc.type === 'Other' && doc.customTypeName) {
              allExpectedDocTypeKeys.add(`Other:${doc.customTypeName}`);
          }
      });
      // Ensure a key for generic 'Other' (no customTypeName) is considered if vehicle has such docs or if it's a standard type.
      // If the vehicle has 'Other' docs without a customTypeName, or if it's generally an expected type.
      if ( (vehicle.documents || []).some(d => d.type === 'Other' && !d.customTypeName) || DOCUMENT_TYPES.includes('Other')) {
          allExpectedDocTypeKeys.add('Other:GENERIC');
      }


      allExpectedDocTypeKeys.forEach(typeKey => {
        const [docTypeForLookup, customTypeNameForLookup] = typeKey.startsWith('Other:')
            ? ['Other' as DocumentType, typeKey.split(':')[1] === 'GENERIC' ? undefined : typeKey.split(':')[1]]
            : [typeKey as DocumentType, undefined];

        const activeDoc = latestActiveDocsMap.get(typeKey);

        if (activeDoc) { // If an active document (with expiry) was found
          const status = getDocumentComplianceStatus(activeDoc.expiryDate); // expiryDate is guaranteed here
          const daysDiff = differenceInDays(parseISO(activeDoc.expiryDate!), now);

          if ((!filters?.statuses || filters.statuses.includes(status)) &&
              (!filters?.documentTypes || filters.documentTypes.includes(activeDoc.type))) {
            reportableDocs.push({
              ...activeDoc,
              status: status,
              vehicleRegistration: vehicle.registrationNumber,
              daysDifference: daysDiff,
            });
          }
        } else { // No active document (with expiry) found for this typeKey, consider it "Missing"
          const status = 'Missing';
          if ((!filters?.statuses || filters.statuses.includes(status)) &&
              (!filters?.documentTypes || filters.documentTypes.includes(docTypeForLookup))) {

            // Try to find any version of this document type (even without expiry) to get some details
            const anyVersionOfDoc = (vehicle.documents || []).find(d =>
                d.type === docTypeForLookup &&
                (docTypeForLookup !== 'Other' || d.customTypeName === customTypeNameForLookup)
            );

            reportableDocs.push({
              id: anyVersionOfDoc?.id || generateId(), // Use existing ID or generate one
              vehicleId: vehicle.id,
              type: docTypeForLookup,
              customTypeName: customTypeNameForLookup,
              policyNumber: anyVersionOfDoc?.policyNumber || null,
              startDate: anyVersionOfDoc?.startDate || null,
              expiryDate: null, // Explicitly null for missing
              documentUrl: anyVersionOfDoc?.documentUrl || null,
              documentName: anyVersionOfDoc?.documentName || null,
              status: status,
              uploadedAt: anyVersionOfDoc?.uploadedAt || formatISO(new Date(0)), // Default if no version found
              vehicleRegistration: vehicle.registrationNumber,
              daysDifference: -Infinity, // Consistent value for sorting Missing
              aiExtractedPolicyNumber: anyVersionOfDoc?.aiExtractedPolicyNumber || null,
              aiPolicyNumberConfidence: anyVersionOfDoc?.aiPolicyNumberConfidence || null,
              aiExtractedStartDate: anyVersionOfDoc?.aiExtractedStartDate || null,
              aiStartDateConfidence: anyVersionOfDoc?.aiStartDateConfidence || null,
              aiExtractedDate: anyVersionOfDoc?.aiExtractedDate || null,
              aiConfidence: anyVersionOfDoc?.aiConfidence || null,
            });
          }
        }
      });
    });

    // Sort final list
    const sorted = reportableDocs.sort((a, b) => {
      const statusOrderValue = (s: ReportableDocument['status']) => ({ 'Overdue': 1, 'ExpiringSoon': 2, 'Missing': 3, 'Compliant': 4 }[s] || 5);
      const statusDiff = statusOrderValue(a.status) - statusOrderValue(b.status);
      if (statusDiff !== 0) return statusDiff;

      // For Compliant, sort by furthest expiry first (more daysDifference is better)
      // For others, sort by closest expiry/most overdue first (less daysDifference is more urgent)
      let daysDiffCompare = (a.status === 'Compliant' && b.status === 'Compliant') ? (b.daysDifference - a.daysDifference) : (a.daysDifference - b.daysDifference);
      if (daysDiffCompare !== 0) return daysDiffCompare;

      return a.vehicleRegistration.localeCompare(b.vehicleRegistration);
    });
    logger.info(`Returning ${sorted.length} reportable documents.`);
    return sorted;

  } catch (error) {
    logger.error('Error fetching reportable documents:', error, { filters });
    return [];
  }
}


