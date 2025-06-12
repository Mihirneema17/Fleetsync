
'use server';

import { getAlerts, getCurrentUser } from '@/lib/data';
import type { User, Alert } from '@/lib/types'; // Assuming Alert type is needed for full getAlerts, though we only need count
import { logger } from '@/lib/logger';


export async function getUnreadAlertsCountAction(): Promise<number> {
  try {
    const unreadAlerts = await getAlerts(true); // true for onlyUnread
    return unreadAlerts.length;
  } catch (error) {
    logger.error('Error in getUnreadAlertsCountAction:', error);
    // Return a default value in case of error to prevent unhandled server exceptions
    // from causing an "unexpected response" on the client.
    return 0;
  }
}

export async function getCurrentUserAction(): Promise<User | null> {
  try {
    return await getCurrentUser();
  } catch (error) {
    logger.error('Error in getCurrentUserAction:', error);
    // Return null or handle error as appropriate to prevent "unexpected response"
    return null;
  }
}

