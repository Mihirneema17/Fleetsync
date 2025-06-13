
'use server';

import { getAlerts, getCurrentUser as getCurrentUserFromData, getVehicles } from '@/lib/data';
import type { User, Alert, SearchResultItem, VehicleDocument } from '@/lib/types'; 
import { logger } from '@/lib/logger';
import { getLatestDocumentForType } from '@/lib/utils';
// Firebase Admin SDK might be used here in a real backend for verifying user tokens securely
// For now, we'll rely on the UID passed from the client if needed.


export async function getUnreadAlertsCountAction(currentUserId: string | null): Promise<number> {
  logger.info('[SA_START] getUnreadAlertsCountAction', { currentUserId });
  if (!currentUserId) {
    logger.info('[SA_WARN] getUnreadAlertsCountAction - No currentUserId, returning 0');
    return 0;
  }
  try {
    const unreadAlerts = await getAlerts(currentUserId, true); // true for onlyUnread
    const count = unreadAlerts.length;
    logger.info(`[SA_SUCCESS] getUnreadAlertsCountAction - Returning count: ${count} for user ${currentUserId}`);
    return count;
  } catch (error) {
    logger.error('[SA_ERROR] Error in getUnreadAlertsCountAction:', error, { currentUserId });
    logger.info('[SA_FAIL] getUnreadAlertsCountAction - Returning default: 0');
    return 0;
  }
}

// This action is intended to be called by server components or other server actions
// if they need to know about the currently authenticated user based on server-side context.
// Authentication state on the server is complex with Next.js App Router without
// explicitly passing tokens or using NextAuth.js or similar.
// For now, this is simplified and might rely on a passed UID if available,
// or would need enhancement for true server-side session detection.
export async function getCurrentUserAction(authUserId?: string): Promise<User | null> {
  logger.info('[SA_START] getCurrentUserAction', { authUserId });
  try {
    const user = await getCurrentUserFromData(authUserId); // Uses the new data function
    if (user) {
      logger.info(`[SA_SUCCESS] getCurrentUserAction - Returning user from data store: UID ${user.uid}, Role: ${user.role}`);
    } else {
      logger.info('[SA_SUCCESS] getCurrentUserAction - No user found in data store or no authUserId.');
    }
    return user;
  } catch (error) {
    logger.error('[SA_ERROR] Error in getCurrentUserAction:', error, { authUserId });
    logger.info('[SA_FAIL] getCurrentUserAction - Returning default: null');
    return null;
  }
}

export async function getRecentUnreadAlertsAction(currentUserId: string | null, limit: number = 5): Promise<Alert[]> {
  logger.info('[SA_START] getRecentUnreadAlertsAction', { limit, currentUserId });
   if (!currentUserId) {
    logger.info('[SA_WARN] getRecentUnreadAlertsAction - No currentUserId, returning empty array');
    return [];
  }
  try {
    const alerts = await getAlerts(currentUserId, true, limit);
    logger.info(`[SA_SUCCESS] getRecentUnreadAlertsAction - Returning ${alerts.length} alerts for user ${currentUserId}`);
    return alerts;
  } catch (error) {
    logger.error('[SA_ERROR] Error in getRecentUnreadAlertsAction:', error, { limit, currentUserId });
    logger.info('[SA_FAIL] getRecentUnreadAlertsAction - Returning empty array');
    return [];
  }
}

export async function globalSearchAction(searchTerm: string, currentUserId: string | null): Promise<SearchResultItem[]> {
  logger.info('[SA_START] globalSearchAction', { searchTerm, currentUserId });
  if (!currentUserId) {
    logger.info('[SA_WARN] globalSearchAction - No currentUserId, returning empty array');
    return [];
  }
  if (!searchTerm || searchTerm.trim().length < 2) {
    logger.info('[SA_INFO] globalSearchAction - Search term too short, returning empty array');
    return [];
  }

  const lowerSearchTerm = searchTerm.toLowerCase();
  const results: SearchResultItem[] = [];

  try {
    const vehicles = await getVehicles(currentUserId); // Pass currentUserId
    logger.debug(`[SA_DATA] globalSearchAction - Fetched ${vehicles.length} vehicles for search for user ${currentUserId}`);

    for (const vehicle of vehicles) {
      // Search Vehicle Registration
      if (vehicle.registrationNumber.toLowerCase().includes(lowerSearchTerm)) {
        results.push({
          id: `vehicle-${vehicle.id}`,
          type: 'vehicle',
          title: vehicle.registrationNumber,
          description: `${vehicle.make} ${vehicle.model} - ${vehicle.type}`,
          link: `/vehicles/${vehicle.id}`,
          vehicleId: vehicle.id,
        });
      }
      // Search Vehicle Make/Model
      if (`${vehicle.make} ${vehicle.model}`.toLowerCase().includes(lowerSearchTerm) && !results.find(r => r.type === 'vehicle' && r.vehicleId === vehicle.id)) {
         results.push({
          id: `vehicle-${vehicle.id}-makemodel`,
          type: 'vehicle',
          title: `${vehicle.make} ${vehicle.model}`,
          description: `Vehicle: ${vehicle.registrationNumber}`,
          link: `/vehicles/${vehicle.id}`,
          vehicleId: vehicle.id,
        });
      }

      const uniqueDocTypes = new Set<string>();
      vehicle.documents.forEach(doc => {
          if (doc.type === 'Other' && doc.customTypeName) {
            uniqueDocTypes.add(`Other:${doc.customTypeName}`);
          } else if (doc.type !== 'Other') {
            uniqueDocTypes.add(doc.type);
          } else {
            uniqueDocTypes.add('Other:GENERIC');
          }
      });
      
      for (const typeKey of uniqueDocTypes) {
        let docTypeForLookup: import('@/lib/types').DocumentType;
        let customTypeNameForLookup: string | undefined;

        if (typeKey.startsWith('Other:')) {
            docTypeForLookup = 'Other';
            customTypeNameForLookup = typeKey.substring(6) === 'GENERIC' ? undefined : typeKey.substring(6);
        } else {
            docTypeForLookup = typeKey as import('@/lib/types').DocumentType;
        }
        
        const latestDoc = getLatestDocumentForType(vehicle, docTypeForLookup, customTypeNameForLookup);

        if (latestDoc?.policyNumber && latestDoc.policyNumber.toLowerCase().includes(lowerSearchTerm)) {
          results.push({
            id: `document-${latestDoc.id}-${vehicle.id}`,
            type: 'document',
            title: `${latestDoc.customTypeName || latestDoc.type} for ${vehicle.registrationNumber}`,
            description: `Policy #: ${latestDoc.policyNumber}`,
            link: `/vehicles/${vehicle.id}?scrollToDoc=${latestDoc.id}`,
            vehicleId: vehicle.id,
            documentId: latestDoc.id
          });
        }
      }
    }
    logger.info(`[SA_SUCCESS] globalSearchAction - Found ${results.length} results for term: "${searchTerm}" for user ${currentUserId}`);
    return results.slice(0, 10); 
  } catch (error) {
    logger.error('[SA_ERROR] Error in globalSearchAction:', error, { searchTerm, currentUserId });
    logger.info('[SA_FAIL] globalSearchAction - Returning empty array due to error');
    return [];
  }
}
