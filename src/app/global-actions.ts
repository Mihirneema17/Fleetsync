
'use server';

import { getAlerts, getCurrentUser } from '@/lib/data';
import type { User } from '@/lib/types'; // Alert type removed as not directly used for return type here
import { logger } from '@/lib/logger';


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

