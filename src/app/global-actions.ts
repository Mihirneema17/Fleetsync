
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
    return 0; // Return a default value in case of error
  }
}

export async function getCurrentUserAction(): Promise<User | null> {
  try {
    return await getCurrentUser();
  } catch (error) {
    logger.error('Error in getCurrentUserAction:', error);
    return null; // Return null or handle error as appropriate
  }
}
