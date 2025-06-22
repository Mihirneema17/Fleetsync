
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
  limit as firestoreLimit, // Add limit import
  setDoc, // For setting a document with a specific ID
} from 'firebase/firestore';
import type { Vehicle, VehicleDocument, Alert, SummaryStats, User, AuditLogEntry, AuditLogAction, DocumentType, UserRole, VehicleComplianceStatusBreakdown, ReportableDocument, FirebaseUser } from './types';
import { DOCUMENT_TYPES, EXPIRY_WARNING_DAYS, DATE_FORMAT } from './constants';
import { format, formatISO, addDays, isBefore, parseISO, differenceInDays } from 'date-fns';
import { logger } from './logger'; // Import the logger
import { getDocumentComplianceStatus, getLatestDocumentForType } from './utils'; // Import from utils
import type { SmartIngestOutput } from '@/ai/flows/smart-ingest-flow'; // Import SmartIngestOutput

// Diagnostic check for db initialization
if (!db) {
  logger.error("[CRITICAL_DATA_INIT_FAILURE] Firestore 'db' instance is NOT initialized at the time of data.ts module evaluation. Firebase setup in firebase.ts likely failed catastrophically. Further Firestore operations will fail.");
  throw new Error("[CRITICAL_DATA_INIT_FAILURE] Firestore 'db' not available in data.ts.");
} else {
  logger.info("[DATA_INIT_SUCCESS] Firestore 'db' instance is confirmed available at data.ts module evaluation.");
}

// --- Helper Functions ---
const generateId = () => {
  if (!db) {
    logger.error("generateId: Firestore 'db' instance is not initialized. Cannot generate ID.");
    throw new Error("Firestore 'db' instance not initialized for generateId.");
  }
  return doc(collection(db, '_')).id; // Generate Firestore compatible ID
}

async function internalLogAuditEvent(
  action: AuditLogAction,
  entityType: AuditLogEntry['entityType'],
  userId: string | null, // Added userId parameter
  entityId?: string | null, 
  details: Record<string, any> = {},
  entityRegistration?: string | null
) {
  if (!db) {
    logger.error("internalLogAuditEvent: Firestore 'db' instance is not initialized. Audit event cannot be logged.");
    return;
  }
  if (!userId) {
    logger.warn("internalLogAuditEvent: Attempted to log event without a userId. Logging as 'system_unknown'.", { action, entityType });
    userId = 'system_unknown';
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
      userId: userId,
      action,
      entityType,
      entityId: entityId === undefined ? null : entityId,
      entityRegistration: entityRegistration === undefined ? null : entityRegistration,
      details: cleanedDetails,
    };
    await addDoc(collection(db, 'auditLogs'), auditLogData);
    logger.info('Audit event logged successfully', { action, entityType, entityId, userId });
  } catch (error) {
    logger.error("Error logging audit event to Firestore:", error, {action, entityType, entityId, details, entityRegistration, userId});
  }
}

// --- Alerts ---
async function generateAlertsForVehicle(vehicle: Vehicle, currentUserId: string | null) {
  if (!db) {
    logger.error("generateAlertsForVehicle: Firestore 'db' instance is not initialized. Alerts cannot be generated.");
    return;
  }
  if (!vehicle || !vehicle.id) {
    logger.warn("generateAlertsForVehicle: Invalid vehicle object provided.", { vehicle });
    return;
  }
  if (!currentUserId) {
     logger.warn("generateAlertsForVehicle: No currentUserId provided. Alerts will be associated with 'system_default_user'.");
     currentUserId = 'system_default_user'; // Fallback, ideally should always have a user
  }
  logger.info(`Starting alert generation for vehicle ${vehicle.id} by user ${currentUserId}`);
  try { 
    const alertsColRef = collection(db, "alerts");

    const existingUnreadAlertsQuery = query(alertsColRef,
      where('vehicleId', '==', vehicle.id),
      where('isRead', '==', false),
      where('userId', '==', currentUserId) // Filter by current user
    );
    const existingUnreadAlertsSnap = await getDocs(existingUnreadAlertsQuery);
    const batch = writeBatch(db);
    existingUnreadAlertsSnap.forEach(alertDoc => {
        logger.debug(`Deleting existing unread alert ${alertDoc.id} for vehicle ${vehicle.id} by user ${currentUserId}`);
        batch.delete(alertDoc.ref);
    });
    await batch.commit();
    logger.info(`Cleared ${existingUnreadAlertsSnap.size} existing unread alerts for vehicle ${vehicle.id} by user ${currentUserId}`);

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
          const alertMessage = `${latestDoc.type === 'Other' && latestDoc.customTypeName ? latestDoc.customTypeName : latestDoc.type} for ${vehicle.registrationNumber} is ${currentStatus === 'ExpiringSoon' ? `expiring on ${format(parseISO(latestDoc.expiryDate), 'PPP')}` : `overdue since ${format(parseISO(latestDoc.expiryDate), 'PPP')}`}. (Policy: ${latestDoc.policyNumber || 'N/A'}, Uploaded: ${format(parseISO(latestDoc.uploadedAt), 'MMM dd, yyyy')})`;
          const newAlertData: Omit<Alert, 'id' | 'createdAt' | 'dueDate'> & { createdAt: Timestamp, dueDate: string } = { 
            vehicleId: vehicle.id,
            vehicleRegistration: vehicle.registrationNumber,
            documentType: latestDoc.type,
            customDocumentTypeName: latestDoc.customDocumentTypeName || null, 
            policyNumber: latestDoc.policyNumber || null, 
            dueDate: latestDoc.expiryDate, 
            message: alertMessage,
 createdAt: Timestamp.now(),
 isRead: false,
            userId: currentUserId,
          };
          const alertDocRef = doc(collection(db, 'alerts'), newAlertId);
          await setDoc(alertDocRef, { id: newAlertId, ...newAlertData }); // Use setDoc with explicit ID
          logger.info(`Generated ${currentStatus} alert for vehicle ${vehicle.id}, doc type ${typeKey}`, { alertId: newAlertId });
        }
 }
    }
    logger.info(`Finished alert generation for vehicle ${vehicle.id}`);
  } catch (error) {
    logger.error(`Critical error during alert generation for vehicle ${vehicle.id}:`, error);
  }
}

export async function getAlerts(currentUserId: string | null, onlyUnread: boolean = false, limit?: number): Promise<Alert[]> {
  if (!db) {
    logger.error("[DATA] getAlerts: Firestore 'db' instance is not initialized. Cannot fetch alerts.");
    return [];
  }
  if (!currentUserId) {
    logger.warn("[DATA] getAlerts: No currentUserId provided. Returning empty array.");
    return [];
  }
  logger.info(`[DATA] getAlerts called by user ${currentUserId}. onlyUnread: ${onlyUnread}, limit: ${limit}`);
  try {
    const alertsColRef = collection(db, "alerts");
    const queryConstraints: QueryConstraint[] = [
      where('userId', '==', currentUserId), // Essential: Filter by the current user
      orderBy('createdAt', 'desc')
    ];

    if (onlyUnread) {
      queryConstraints.unshift(where('isRead', '==', false));
    }
    if (limit) {
        queryConstraints.push(firestoreLimit(limit));
    }

    const q = query(alertsColRef, ...queryConstraints);
    const alertSnapshot = await getDocs(q);
    logger.info(`[DATA] getAlerts fetched ${alertSnapshot.docs.length} alerts for user ${currentUserId}.`);

    return alertSnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        vehicleId: data.vehicleId || '',
        vehicleRegistration: data.vehicleRegistration || '',
        documentType: data.documentType || 'Other',
 customTypeName: data.customTypeName || undefined,
        dueDate: data.dueDate, 
        message: data.message || '',
        createdAt: (data.createdAt as Timestamp)?.toDate ? formatISO((data.createdAt as Timestamp).toDate()) : new Date(0).toISOString(),
        isRead: data.isRead || false,
        userId: data.userId || null,
        policyNumber: data.policyNumber || null,
      } as Alert;
    });
  } catch (error) {
    logger.error(`[DATA] Error fetching alerts for user ${currentUserId} from Firestore:`, error);
    return []; 
  }
}

export async function markAlertAsRead(alertId: string, currentUserId: string | null): Promise<boolean> {
  if (!db) {
    logger.error("markAlertAsRead: Firestore 'db' instance is not initialized. Cannot mark alert.");
    return false;
  }
  if (!currentUserId) {
    logger.warn("markAlertAsRead: No currentUserId provided. Cannot mark alert.");
    return false;
  }
  const alertRef = doc(db, 'alerts', alertId);
  try {
    const alertSnap = await getDoc(alertRef);
    if (!alertSnap.exists() || alertSnap.data()?.userId !== currentUserId) {
        logger.warn(`markAlertAsRead: Alert ${alertId} not found or user ${currentUserId} not authorized.`);
        return false;
    }
    await updateDoc(alertRef, { isRead: true });
    const alertData = alertSnap.data();
    internalLogAuditEvent('MARK_ALERT_READ', 'ALERT', currentUserId, alertId, { documentType: alertData.documentType, vehicleRegistration: alertData.vehicleRegistration }, alertData.vehicleRegistration);
    logger.info(`Alert ${alertId} marked as read by user ${currentUserId}.`);
    return true;
  } catch (error: any) {
    logger.error(`Error marking alert ${alertId} as read by user ${currentUserId}:`, error);
    return false;
  }
}


// --- Data Operations (Firestore) ---

export async function getVehicles(currentUserId: string | null): Promise<Vehicle[]> {
  if (!db) {
    logger.error("getVehicles: Firestore 'db' instance is not initialized. Cannot fetch vehicles.");
    return [];
  }
   if (!currentUserId) {
    logger.warn("getVehicles: No currentUserId provided. Returning empty array.");
    return [];
  }
  logger.debug(`Fetching all vehicles for user ${currentUserId}...`);
  try {
    const vehiclesCol = collection(db, 'vehicles');
    // Assuming vehicles are user-specific, add a where clause.
    // If vehicles are global, this where clause would be removed.
    // For now, let's assume vehicles are associated with the user who created them.
    // We would need a 'ownerId' or 'userId' field on the vehicle document.
    // As this field is not there yet, this query will fetch all vehicles.
    // This needs to be addressed when RBAC is fully implemented.
    // For now, to allow functionality, we fetch all.
    // const q = query(vehiclesCol, where('ownerId', '==', currentUserId), orderBy('registrationNumber'));
    const q = query(vehiclesCol, orderBy('registrationNumber')); // TEMP: Fetching all
    
    const vehicleSnapshot = await getDocs(q);
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
    logger.info(`Fetched ${vehicleList.length} vehicles for user ${currentUserId} (or globally if ownerId not filtered).`);
    return vehicleList;
  } catch (error) {
    logger.error(`Error fetching vehicles for user ${currentUserId}:`, error);
    return [];
  }
}

export async function getVehicleById(id: string, currentUserId: string | null): Promise<Vehicle | undefined> {
  if (!db) {
    logger.error(`getVehicleById: Firestore 'db' instance is not initialized. Cannot fetch vehicle ${id}.`);
    return undefined;
  }
  if (!currentUserId) {
    logger.warn(`getVehicleById: No currentUserId provided for vehicle ${id}. Access might be restricted.`);
    // Depending on security model, might return undefined or proceed if vehicles can be public.
  }
  logger.debug(`Fetching vehicle by ID: ${id} for user ${currentUserId}`);
  try {
    const vehicleRef = doc(db, 'vehicles', id);
    const vehicleSnap = await getDoc(vehicleRef);
    if (vehicleSnap.exists()) {
      // Add check here if vehicle has an ownerId and if it matches currentUserId
      // For now, if it exists, return it.
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
      logger.info(`Vehicle ${id} fetched successfully by user ${currentUserId}.`);
      return vehicleData;
    }
    logger.warn(`Vehicle with ID ${id} not found.`);
    return undefined;
  } catch (error) {
    logger.error(`Error fetching vehicle by ID ${id} for user ${currentUserId}:`, error);
    return undefined;
  }
}

export async function addVehicle(vehicleData: Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'> & {
  registrationDocument?: { name: string; url: string } | null; // Optional registration document field
  aiExtraction?: SmartIngestOutput | null; // Optional AI extraction data
}, currentUserId: string | null): Promise<Vehicle | undefined> {
  
  if (!db) {
    const errorMsg = "addVehicle: Firestore 'db' instance is not initialized. Cannot add vehicle.";
    logger.error(errorMsg, { vehicleData });
    throw new Error(errorMsg);
  }
  if (!currentUserId) {
    const errorMsg = "addVehicle: No currentUserId provided. Cannot add vehicle.";
    logger.error(errorMsg, { vehicleData });
    throw new Error(errorMsg);
  }
  logger.info(`Adding new vehicle by user ${currentUserId}:`, { registrationNumber: vehicleData.registrationNumber });
  const now = Timestamp.now();
  const nowISO = formatISO(now.toDate());

  const { registrationDocument, aiExtraction, ...restVehicleData } = vehicleData;

  try {
    const initialDocuments: VehicleDocument[] = [];

    // Add RegistrationCard document if provided
    if (registrationDocument) {
      initialDocuments.push({
        id: generateId(),
        vehicleId: '', // Will be updated later
        type: 'RegistrationCard',
        customTypeName: null,
        policyNumber: null,
        startDate: null,
        expiryDate: null, // Registration card typically doesn't expire in the same way
        status: 'Compliant', // Assuming upload means compliant for reg card
        uploadedAt: nowISO,
        documentName: registrationDocument.name,
        documentUrl: registrationDocument.url,
 aiExtractedPolicyNumber: aiExtraction?.policyNumber?.value || null,
        aiPolicyNumberConfidence: aiExtraction?.policyNumber?.confidence ?? null,
        aiExtractedStartDate: aiExtraction?.startDate?.value || null,
        aiStartDateConfidence: aiExtraction?.startDate?.confidence ?? null,
        aiExtractedDate: aiExtraction?.expiryDate?.value || null,
        aiConfidence: aiExtraction?.expiryDate?.confidence ?? null,
        // Specific to RegistrationCard if needed later, add here
      });
    }
    DOCUMENT_TYPES.forEach(docType => {
      if (docType !== 'Other') { 
        initialDocuments.push({
          id: generateId(),
          vehicleId: '', 
          type: docType,
          customTypeName: null, 
          policyNumber: null,  
          startDate: null,      
          expiryDate: null,     
          status: 'Missing',
          uploadedAt: nowISO,
          documentName: null,  
          documentUrl: null,   
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
      ...restVehicleData,
      ownerId: currentUserId, // Associate vehicle with the user
      documents: initialDocuments, 
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await addDoc(collection(db, 'vehicles'), newVehicleDataToStore);
    logger.info(`Vehicle added successfully by user ${currentUserId} with ID: ${docRef.id}`);

    const finalInitialDocuments = initialDocuments.map(d => ({...d, vehicleId: docRef.id}));
    await updateDoc(docRef, { documents: finalInitialDocuments });
    logger.info(`Initial documents updated with vehicleId for ${docRef.id}`);

    const newVehicleForReturn: Vehicle = {
      ...restVehicleData,
      id: docRef.id,
      documents: finalInitialDocuments,
      createdAt: nowISO,
      updatedAt: nowISO,
    };

    internalLogAuditEvent('CREATE_VEHICLE', 'VEHICLE', currentUserId, docRef.id, { ...vehicleData }, vehicleData.registrationNumber);

    generateAlertsForVehicle(newVehicleForReturn, currentUserId as string)
      .then(() => logger.info(`Background alert generation initiated for new vehicle ${newVehicleForReturn.id} by user ${currentUserId}`))
      .catch(err => logger.error(`Background alert generation failed for new vehicle ${newVehicleForReturn.id} by user ${currentUserId}:`, err));

    return newVehicleForReturn; // Return the newly created vehicle
  } catch (error) {
    logger.error(`Error during addVehicle core logic by user ${currentUserId}:`, error, { restVehicleData, registrationDocument });
    throw error; 
  }
}

export async function updateVehicle(id: string, updates: Partial<Omit<Vehicle, 'id' | 'documents' | 'createdAt' | 'updatedAt'>>, currentUserId: string | null): Promise<Vehicle | undefined> {
  if (!db) {
    logger.error(`updateVehicle: Firestore 'db' instance is not initialized. Cannot update vehicle ${id}.`);
    return undefined;
  }
   if (!currentUserId) {
    logger.warn(`updateVehicle: No currentUserId provided for vehicle ${id}. Update rejected.`);
    return undefined; // Or throw an error
  }
  logger.info(`Updating vehicle ${id} by user ${currentUserId}:`, updates);
  try {
    const vehicleRef = doc(db, 'vehicles', id);
    const vehicleSnap = await getDoc(vehicleRef);
    if (!vehicleSnap.exists()) {
      logger.warn(`Update failed: Vehicle ${id} not found.`);
      return undefined;
    }
    // Add owner check here if ownerId field exists and is enforced
    // if (vehicleSnap.data()?.ownerId !== currentUserId) {
    //   logger.warn(`User ${currentUserId} not authorized to update vehicle ${id}.`);
    //   return undefined;
    // }

    const oldVehicleData = vehicleSnap.data() as Omit<Vehicle, 'id'>; 
    const updatedDataToStore = { ...updates, updatedAt: Timestamp.now() };
    await updateDoc(vehicleRef, updatedDataToStore);
    logger.info(`Vehicle ${id} updated successfully by user ${currentUserId}.`);

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
      internalLogAuditEvent('UPDATE_VEHICLE', 'VEHICLE', currentUserId, id, { updates: changedFields }, currentRegNumber);
    }

    const updatedVehicle = await getVehicleById(id, currentUserId);
    if (updatedVehicle) {
      generateAlertsForVehicle(updatedVehicle, currentUserId as string)
        .then(() => logger.info(`Background alert generation initiated for updated vehicle ${updatedVehicle.id} by user ${currentUserId}`))
        .catch(err => logger.error(`Background alert generation failed for updated vehicle ${updatedVehicle.id} by user ${currentUserId}:`, err));
    }
    return updatedVehicle;
  } catch (error) {
    logger.error(`Error updating vehicle ${id} by user ${currentUserId}:`, error, { updates });
    return undefined; 
  }
}

export async function deleteVehicle(id: string, currentUserId: string | null): Promise<boolean> {
  if (!db) {
    logger.error(`deleteVehicle: Firestore 'db' instance is not initialized. Cannot delete vehicle ${id}.`);
    return false;
  }
  if (!currentUserId) {
    logger.warn(`deleteVehicle: No currentUserId provided for vehicle ${id}. Deletion rejected.`);
    return false;
  }
  logger.info(`Attempting to delete vehicle ${id} by user ${currentUserId}`);
  try {
    const vehicleRef = doc(db, 'vehicles', id);
    const vehicleSnap = await getDoc(vehicleRef);
    if (!vehicleSnap.exists()) {
      logger.warn(`Delete failed: Vehicle ${id} not found.`);
      return false;
    }
    // Add owner check here
    // if (vehicleSnap.data()?.ownerId !== currentUserId) {
    //   logger.warn(`User ${currentUserId} not authorized to delete vehicle ${id}.`);
    //   return false;
    // }

    const vehicleToDeleteData = vehicleSnap.data() as Vehicle;

    await deleteDoc(vehicleRef);
    logger.info(`Vehicle ${id} deleted from 'vehicles' collection by user ${currentUserId}.`);

    const alertsCol = collection(db, 'alerts');
    const q = query(alertsCol, where('vehicleId', '==', id), where('userId', '==', currentUserId));
    const alertSnapshot = await getDocs(q);
    const batch = writeBatch(db);
    alertSnapshot.docs.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();
    logger.info(`Deleted ${alertSnapshot.size} alerts associated with vehicle ${id} for user ${currentUserId}.`);

    internalLogAuditEvent('DELETE_VEHICLE', 'VEHICLE', currentUserId, id, { registrationNumber: vehicleToDeleteData.registrationNumber }, vehicleToDeleteData.registrationNumber);
    return true;
  } catch (error) {
    logger.error(`Error deleting vehicle ${id} by user ${currentUserId}:`, error);
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
    expiryDate: string | null; 
    documentName?: string | null;
    documentUrl?: string | null; 
    aiExtractedPolicyNumber?: string | null;
    aiPolicyNumberConfidence?: number | null;
    aiExtractedStartDate?: string | null;
    aiStartDateConfidence?: number | null;
    aiExtractedDate?: string | null; 
    aiConfidence?: number | null;
    // New fields for RegistrationCard AI extraction
    aiExtractedRegistrationNumber?: string | null;
    aiRegistrationNumberConfidence?: number | null;
    aiExtractedMake?: string | null;
    aiMakeConfidence?: number | null;
    aiExtractedModel?: string | null;
    aiModelConfidence?: number | null;
    aiConfidence?: number | null;   
  },
  currentUserId: string | null
): Promise<Vehicle | undefined> {
  if (!db) {
    logger.error(`addOrUpdateDocument: Firestore 'db' instance is not initialized. Cannot process document for vehicle ${vehicleId}.`);
    return undefined;
  }
  if (!currentUserId) {
    logger.warn(`addOrUpdateDocument: No currentUserId provided for vehicle ${vehicleId}. Document operation rejected.`);
    return undefined;
  }
  logger.info(`Adding/updating document for vehicle ${vehicleId} by user ${currentUserId}:`, { type: docData.type, name: docData.documentName });
  try {
    const vehicleRef = doc(db, 'vehicles', vehicleId);
    const vehicleSnap = await getDoc(vehicleRef);
    if (!vehicleSnap.exists()) {
      logger.error(`Vehicle not found for adding document: ${vehicleId}`);
      return undefined;
    }
    // Add owner check for vehicle
    // if (vehicleSnap.data()?.ownerId !== currentUserId) {
    //    logger.warn(`User ${currentUserId} not authorized to add document to vehicle ${vehicleId}.`);
    //    return undefined;
    // }

    const vehicle = { id: vehicleSnap.id, ...vehicleSnap.data() } as Vehicle;
    let documents = vehicle.documents || [];
    const newDocId = generateId();
    const status = getDocumentComplianceStatus(docData.expiryDate as string);
    const uploadedAtISO = formatISO(new Date());

    const newDocument: VehicleDocument = {
      id: newDocId,
      vehicleId: vehicleId,
      type: docData.type,
      customTypeName: docData.type === 'Other' ? (docData.customTypeName || null) : null,
      policyNumber: docData.policyNumber || null,
      startDate: docData.startDate || null,
      expiryDate: docData.expiryDate as string, 
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
      // Include RegistrationCard specific AI fields if type is RegistrationCard
      aiExtractedRegistrationNumber: docData.type === 'RegistrationCard' ? (docData.aiExtractedRegistrationNumber || null) : null,
      aiRegistrationNumberConfidence: docData.type === 'RegistrationCard' ? (docData.aiRegistrationNumberConfidence === undefined ? null : docData.aiRegistrationNumberConfidence) : null,
      aiExtractedMake: docData.type === 'RegistrationCard' ? (docData.aiExtractedMake || null) : null,
      aiMakeConfidence: docData.type === 'RegistrationCard' ? (docData.aiMakeConfidence === undefined ? null : docData.aiMakeConfidence) : null,
      aiExtractedModel: docData.type === 'RegistrationCard' ? (docData.aiExtractedModel || null) : null,
      aiModelConfidence: docData.type === 'RegistrationCard' ? (docData.aiModelConfidence === undefined ? null : docData.aiModelConfidence) : null,
      aiConfidence: docData.aiConfidence === undefined ? null : docData.aiConfidence,
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
    logger.info(`Document ${newDocId} added to vehicle ${vehicleId} by user ${currentUserId}.`);

    internalLogAuditEvent('UPLOAD_DOCUMENT', 'DOCUMENT', currentUserId, newDocId, {
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

    const finalUpdatedVehicle = await getVehicleById(vehicleId, currentUserId);
    if (finalUpdatedVehicle) {
      generateAlertsForVehicle(finalUpdatedVehicle, currentUserId as string)
        .then(() => logger.info(`Background alert generation initiated for document update on vehicle ${finalUpdatedVehicle.id} by user ${currentUserId}`))
        .catch(err => logger.error(`Background alert generation failed for document update on vehicle ${finalUpdatedVehicle.id} by user ${currentUserId}:`, err));
    }
    return finalUpdatedVehicle;
  } catch (error) {
    logger.error(`Error adding/updating document for vehicle ${vehicleId} by user ${currentUserId}:`, error, { docDataType: docData.type });
    return undefined;
  }
}


// --- Summary Stats ---
export async function getSummaryStats(currentUserId: string | null): Promise<SummaryStats> {
  if (!db) {
    logger.error("[DATA] getSummaryStats: Firestore 'db' instance is not initialized. Cannot generate stats.");
    return {
      totalVehicles: 0, compliantVehicles: 0, expiringSoonDocuments: 0, overdueDocuments: 0,
      expiringInsurance: 0, overdueInsurance: 0, expiringFitness: 0, overdueFitness: 0,
      expiringPUC: 0, overduePUC: 0, expiringAITP: 0, overdueAITP: 0,
      vehicleComplianceBreakdown: { compliant: 0, expiringSoon: 0, overdue: 0, missingInfo: 0, total: 0 },
    };
  }
   if (!currentUserId) {
    logger.warn("[DATA] getSummaryStats: No currentUserId provided. Stats will be for all accessible vehicles if not filtered by ownerId, or empty.");
    // Potentially return zeroed stats or proceed if a global view is intended (and data is structured for it)
  }
  logger.info(`[DATA] getSummaryStats called by user ${currentUserId}`);
  try {
    const allVehicles = await getVehicles(currentUserId); // Pass currentUserId

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
              } else { 
                  uniqueActiveDocTypesInVehicle.add('Other:GENERIC'); 
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
    logger.info(`[DATA] getSummaryStats successfully computed for user ${currentUserId} and returning`, { summary: resultSummary });
    return resultSummary;
  } catch (error) {
    logger.error(`[DATA] Error in getSummaryStats for user ${currentUserId}:`, error);
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

  const activeDocs = (vehicle.documents || []).filter(d => d.expiryDate);

  if (activeDocs.length === 0 && essentialDocsPresentAndActive < ESSENTIAL_DOC_TYPES.length) {
    return 'MissingInfo';
  }

  for (const doc of activeDocs) {
    if (doc.expiryDate) { 
      const status = getDocumentComplianceStatus(doc.expiryDate);
      if (status === 'Overdue') isOverdue = true;
      if (status === 'ExpiringSoon') isExpiringSoon = true;
    }
  }

  if (isOverdue) return 'Overdue';
  if (isExpiringSoon) return 'ExpiringSoon';
  if (!hasAllEssentialsWithExpiry && essentialDocsPresentAndActive < ESSENTIAL_DOC_TYPES.length) return 'MissingInfo';
  return 'Compliant';
};


// --- Audit Logs ---
export async function getAuditLogs(filters?: {
  userIdAudit?: string; // Renamed to avoid conflict with potential currentUserId
  entityType?: AuditLogEntry['entityType'];
  action?: AuditLogAction;
  dateFrom?: string; // ISO Date string yyyy-MM-dd
  dateTo?: string;   // ISO Date string yyyy-MM-dd
}, currentUserId?: string | null): Promise<AuditLogEntry[]> { // Added currentUserId for potential admin filtering
  if (!db) {
    logger.error("getAuditLogs: Firestore 'db' instance is not initialized. Cannot fetch audit logs.");
    return [];
  }
  // Optional: Add admin check here if only admins can view all logs
  // if (currentUser?.role !== 'admin' && filters?.userIdAudit !== currentUserId) {
  //   logger.warn("getAuditLogs: Non-admin user attempting to fetch logs for another user. Denied.");
  //   return [];
  // }

  try {
    const auditLogsColRef = collection(db, "auditLogs");
    const queryConstraints: QueryConstraint[] = [orderBy('timestamp', 'desc')]; 

    if (filters?.userIdAudit) queryConstraints.unshift(where('userId', '==', filters.userIdAudit));
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
        timestamp: formatISO((data.timestamp as Timestamp).toDate()), 
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

export async function recordCsvExportAudit(reportName: string, formatUsed: string, filtersApplied: Record<string, any>, currentUserId: string | null) {
  if (!db) {
    logger.error("recordCsvExportAudit: Firestore 'db' instance is not initialized. Cannot record audit for CSV export.");
    return;
  }
  await internalLogAuditEvent('EXPORT_REPORT', 'REPORT', currentUserId, undefined, {
    reportName,
    format: formatUsed,
    filtersApplied: filtersApplied ? JSON.parse(JSON.stringify(filtersApplied, (key, value) => value instanceof Date ? value.toISOString() : value)) : {},
  });
}

// --- User Data ---

export async function createUserProfile(firebaseUser: FirebaseUser, displayName?: string): Promise<User> {
  if (!db) {
    const errorMsg = "createUserProfile: Firestore 'db' instance is not initialized.";
    logger.error(errorMsg, { uid: firebaseUser.uid });
    throw new Error(errorMsg);
  }
  logger.info(`Creating user profile for UID: ${firebaseUser.uid}`);
  const userRef = doc(db, 'users', firebaseUser.uid);
  const nowISO = formatISO(new Date());

  const newUserProfile: User = {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'New User',
    role: 'viewer', // Default role for new users
    createdAt: nowISO,
    avatarUrl: firebaseUser.photoURL || null,
  };

  try {
    await setDoc(userRef, newUserProfile);
    logger.info(`User profile created successfully for UID: ${firebaseUser.uid}`);
    internalLogAuditEvent('USER_SIGNUP', 'USER', firebaseUser.uid, firebaseUser.uid, { email: firebaseUser.email, role: 'viewer' });
    return newUserProfile;
  } catch (error) {
    logger.error(`Error creating user profile for UID ${firebaseUser.uid}:`, error, { profileData: newUserProfile });
    throw error; // Re-throw so the caller can handle it
  }
}

export async function getUserProfile(uid: string): Promise<User | null> {
  if (!db) {
    logger.error(`getUserProfile: Firestore 'db' instance is not initialized. Cannot fetch profile for UID ${uid}.`);
    return null;
  }
  if (!uid) {
    logger.warn('getUserProfile called with no UID.');
    return null;
  }
  logger.debug(`Fetching user profile for UID: ${uid}`);
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      // Ensure createdAt is string; Firestore might return Timestamp if just written
      const createdAt = data.createdAt instanceof Timestamp ? formatISO(data.createdAt.toDate()) : data.createdAt;
      const userProfile = { ...data, createdAt } as User;
      logger.info(`User profile for UID ${uid} fetched successfully.`);
      return userProfile;
    }
    logger.warn(`User profile for UID ${uid} not found.`);
    return null;
  } catch (error) {
    logger.error(`Error fetching user profile for UID ${uid}:`, error);
    return null;
  }
}


// This function is still primarily for server-side use where Firebase Admin SDK might be used.
// For client-side, AuthContext is the source of truth for the *currently logged-in* user's profile.
export async function getCurrentUser(authUserId?: string): Promise<User | null> {
  logger.info('[DATA] getCurrentUser called', { authUserId });
  if (authUserId) {
    try {
      const userProfile = await getUserProfile(authUserId);
      if (userProfile) {
        logger.info(`[DATA] getCurrentUser - Returning profile for UID: ${authUserId}`);
        return userProfile;
      }
      logger.warn(`[DATA] getCurrentUser - No profile found for authenticated UID: ${authUserId}. A profile should have been created on sign-up.`);
      // Fallback: create a temporary user object if profile is missing, though this is not ideal
      return {
        uid: authUserId,
        email: 'unknown@example.com', // Firebase Auth user might have email
        role: 'viewer',
        createdAt: formatISO(new Date()),
        displayName: 'Unknown User'
      };
    } catch (error) {
      logger.error('[DATA] Error in getCurrentUser fetching profile:', error, { authUserId });
      return null;
    }
  } else {
    logger.info('[DATA] getCurrentUser - No authUserId provided, returning null.');
    return null;
  }
}

// --- Reportable Documents ---
export async function getReportableDocuments(
  currentUserId: string | null,
  filters?: {
    statuses?: Array<'ExpiringSoon' | 'Overdue' | 'Compliant' | 'Missing'>,
    documentTypes?: DocumentType[]
  }
): Promise<ReportableDocument[]> {
  if (!db) {
    logger.error("getReportableDocuments: Firestore 'db' instance is not initialized. Cannot fetch reportable documents.");
    return [];
  }
  if (!currentUserId) {
    logger.warn("getReportableDocuments: No currentUserId. Returning empty array.");
    return [];
  }
  logger.info(`Fetching reportable documents for user ${currentUserId} with filters:`, { filters });
  try {
    const allVehicles = await getVehicles(currentUserId); // Pass currentUserId
    const reportableDocs: ReportableDocument[] = [];
    const now = new Date();
    now.setHours(0,0,0,0); 

    allVehicles.forEach(vehicle => {
      const latestActiveDocsMap = new Map<string, VehicleDocument>();

      (vehicle.documents || []).forEach(doc => {
        if (doc.expiryDate) { 
          const typeKey = doc.type === 'Other' && doc.customTypeName ? `Other:${doc.customTypeName}` : doc.type;
          const existingLatest = latestActiveDocsMap.get(typeKey);
          if (!existingLatest ||
              parseISO(doc.expiryDate) > parseISO(existingLatest.expiryDate!) ||
              (parseISO(doc.expiryDate).getTime() === parseISO(existingLatest.expiryDate!).getTime() && parseISO(doc.uploadedAt) > parseISO(existingLatest.uploadedAt))) {
            latestActiveDocsMap.set(typeKey, doc);
          }
        }
      });

      const allExpectedDocTypeKeys = new Set<string>(DOCUMENT_TYPES.filter(dt => dt !== 'Other'));
      (vehicle.documents || []).forEach(doc => { 
          if (doc.type === 'Other' && doc.customTypeName) {
              allExpectedDocTypeKeys.add(`Other:${doc.customTypeName}`);
          }
      });
      if ( (vehicle.documents || []).some(d => d.type === 'Other' && !d.customTypeName) || DOCUMENT_TYPES.includes('Other')) {
          allExpectedDocTypeKeys.add('Other:GENERIC');
      }


      allExpectedDocTypeKeys.forEach(typeKey => {
        const [docTypeForLookup, customTypeNameForLookup] = typeKey.startsWith('Other:')
            ? ['Other' as DocumentType, typeKey.split(':')[1] === 'GENERIC' ? undefined : typeKey.split(':')[1]]
            : [typeKey as DocumentType, undefined];

        const activeDoc = latestActiveDocsMap.get(typeKey);

        if (activeDoc) { 
          const status = getDocumentComplianceStatus(activeDoc.expiryDate); 
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
        } else { 
          const status = 'Missing';
          if ((!filters?.statuses || filters.statuses.includes(status)) &&
              (!filters?.documentTypes || filters.documentTypes.includes(docTypeForLookup))) {

            const anyVersionOfDoc = (vehicle.documents || []).find(d =>
                d.type === docTypeForLookup &&
                (docTypeForLookup !== 'Other' || d.customTypeName === customTypeNameForLookup)
            );

            reportableDocs.push({
              id: anyVersionOfDoc?.id || generateId(), 
              vehicleId: vehicle.id,
              type: docTypeForLookup,
              customTypeName: customTypeNameForLookup,
              policyNumber: anyVersionOfDoc?.policyNumber || null,
              startDate: anyVersionOfDoc?.startDate || null,
              expiryDate: null, 
              documentUrl: anyVersionOfDoc?.documentUrl || null,
              documentName: anyVersionOfDoc?.documentName || null,
              status: status,
              uploadedAt: anyVersionOfDoc?.uploadedAt || formatISO(new Date(0)), 
              vehicleRegistration: vehicle.registrationNumber,
              daysDifference: -Infinity, 
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

    const sorted = reportableDocs.sort((a, b) => {
      const statusOrderValue = (s: ReportableDocument['status']) => ({ 'Overdue': 1, 'ExpiringSoon': 2, 'Missing': 3, 'Compliant': 4 }[s] || 5);
      const statusDiff = statusOrderValue(a.status) - statusOrderValue(b.status);
      if (statusDiff !== 0) return statusDiff;

      let daysDiffCompare = (a.status === 'Compliant' && b.status === 'Compliant') ? (b.daysDifference - a.daysDifference) : (a.daysDifference - b.daysDifference);
      if (daysDiffCompare !== 0) return daysDiffCompare;

      return a.vehicleRegistration.localeCompare(b.vehicleRegistration);
    });
    logger.info(`Returning ${sorted.length} reportable documents for user ${currentUserId}.`);
    return sorted;

  } catch (error) {
    logger.error(`Error fetching reportable documents for user ${currentUserId}:`, error, { filters });
    return [];
  }
}
