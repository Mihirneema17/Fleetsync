
'use server';

import { getAlerts, getCurrentUser, getVehicles } from '@/lib/data';
import type { User, Alert, SearchResultItem, VehicleDocument } from '@/lib/types'; 
import { logger } from '@/lib/logger';
import { getLatestDocumentForType } from '@/lib/utils';


export async function getUnreadAlertsCountAction(): Promise<number> {
  logger.info('[SA_START] getUnreadAlertsCountAction');
  try {
    const unreadAlerts = await getAlerts(true); // true for onlyUnread
    const count = unreadAlerts.length;
    logger.info(`[SA_SUCCESS] getUnreadAlertsCountAction - Returning count: ${count}`);
    return count;
  } catch (error) {
    logger.error('[SA_ERROR] Error in getUnreadAlertsCountAction:', error);
    logger.info('[SA_FAIL] getUnreadAlertsCountAction - Returning default: 0');
    return 0;
  }
}

export async function getCurrentUserAction(): Promise<User | null> {
  logger.info('[SA_START] getCurrentUserAction');
  try {
    const user = await getCurrentUser();
    if (user) {
      logger.info(`[SA_SUCCESS] getCurrentUserAction - Returning user ID: ${user.id}, Role: ${user.role}`);
    } else {
      logger.info('[SA_SUCCESS] getCurrentUserAction - Returning null user');
    }
    return user;
  } catch (error) {
    logger.error('[SA_ERROR] Error in getCurrentUserAction:', error);
    logger.info('[SA_FAIL] getCurrentUserAction - Returning default: null');
    return null;
  }
}

export async function getRecentUnreadAlertsAction(limit: number = 5): Promise<Alert[]> {
  logger.info('[SA_START] getRecentUnreadAlertsAction', { limit });
  try {
    const alerts = await getAlerts(true, limit);
    logger.info(`[SA_SUCCESS] getRecentUnreadAlertsAction - Returning ${alerts.length} alerts`);
    return alerts;
  } catch (error) {
    logger.error('[SA_ERROR] Error in getRecentUnreadAlertsAction:', error, { limit });
    logger.info('[SA_FAIL] getRecentUnreadAlertsAction - Returning empty array');
    return [];
  }
}

export async function globalSearchAction(searchTerm: string): Promise<SearchResultItem[]> {
  logger.info('[SA_START] globalSearchAction', { searchTerm });
  if (!searchTerm || searchTerm.trim().length < 2) {
    logger.info('[SA_INFO] globalSearchAction - Search term too short, returning empty array');
    return [];
  }

  const lowerSearchTerm = searchTerm.toLowerCase();
  const results: SearchResultItem[] = [];

  try {
    const vehicles = await getVehicles();
    logger.debug(`[SA_DATA] globalSearchAction - Fetched ${vehicles.length} vehicles for search`);

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
      // Search Vehicle Make/Model (less specific, might add too many results if not careful)
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

      // Search Document Policy Numbers (from latest active documents)
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
    logger.info(`[SA_SUCCESS] globalSearchAction - Found ${results.length} results for term: "${searchTerm}"`);
    return results.slice(0, 10); // Limit results to prevent overly large dropdown
  } catch (error) {
    logger.error('[SA_ERROR] Error in globalSearchAction:', error, { searchTerm });
    logger.info('[SA_FAIL] globalSearchAction - Returning empty array due to error');
    return [];
  }
}
