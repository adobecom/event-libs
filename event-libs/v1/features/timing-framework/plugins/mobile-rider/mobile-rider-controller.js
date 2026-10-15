import { getEventConfig } from '../../../../utils/utils.js';
import { logError } from '../../../../utils/lana-log.js';

const MR_PROD_BASE_URL = 'https://overlay-admin-prod.mobilerider.com';
const MR_INTEGRATION_BASE_URL = 'https://overlay-admin-integration.mobilerider.com';

const getEnv = () => getEventConfig()?.miloConfig?.env?.name || 'prod';
const getBaseUrl = () => (getEnv() === 'prod' ? MR_PROD_BASE_URL : MR_INTEGRATION_BASE_URL);

// Keeps each media-status URL a safe length; a MAX schedule has far fewer streams than this.
export const MAX_IDS_PER_REQUEST = 50;

/**
 * MobileRider Controller
 * Handles all interactions with the MobileRider API
 */
class MobileRiderController {
  /**
   * Get the status of multiple media items
   * @param {string[]} ids - Array of media IDs to check
   * @returns {Promise<{active: string[], inactive: string[]}>}
   */
  async getMediaStatus(ids) {
    try {
      const response = await fetch(
        `${getBaseUrl()}/api/media-status?ids=${ids.join(',')}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (!response.ok) {
        const error = await response.json();
        logError('mobile-rider-controller', 'getMediaStatus error', error);
        throw new Error(error.message || 'Failed to get media status');
      }

      return await response.json();
    } catch (error) {
      logError('mobile-rider-controller', 'getMediaStatus error', error);
      throw error;
    }
  }

  /**
   * Check if a media item is active
   * @param {string} id - Media ID to check
   * @returns {Promise<boolean>}
   */
  async isMediaActive(id) {
    try {
      const { active } = await this.getMediaStatus([id]);
      return active.includes(id);
    } catch (error) {
      logError('mobile-rider-controller', 'isMediaActive error', error);
      return false;
    }
  }

  /**
   * Get status for multiple media items in as few requests as possible
   * @param {string[]} ids - Array of media IDs to check
   * @returns {Promise<Map<string, boolean>>} Map of media ID to active status
   */
  async getMediaStatusMap(ids) {
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    const statusMap = new Map(uniqueIds.map((id) => [id, false]));
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += MAX_IDS_PER_REQUEST) {
      chunks.push(uniqueIds.slice(i, i + MAX_IDS_PER_REQUEST));
    }

    // A failed chunk leaves its ids inactive, the same outcome isMediaActive has on failure.
    await Promise.all(chunks.map(async (chunk) => {
      try {
        const { active } = await this.getMediaStatus(chunk);
        const activeIds = new Set(Array.isArray(active) ? active : []);
        chunk.forEach((id) => statusMap.set(id, activeIds.has(id)));
      } catch (error) {
        logError('mobile-rider-controller', 'getMediaStatusMap error', error);
      }
    }));

    return statusMap;
  }
}

export default MobileRiderController;
