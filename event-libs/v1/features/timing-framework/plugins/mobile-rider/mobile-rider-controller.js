import { getEventConfig } from '../../../../utils/utils.js';
import { logError } from '../../../../utils/lana-log.js';

const MR_PROD_BASE_URL = 'https://overlay-admin-prod.mobilerider.com';
const MR_INTEGRATION_BASE_URL = 'https://overlay-admin-integration.mobilerider.com';

const getEnv = () => getEventConfig()?.miloConfig?.env?.name || 'prod';
const getBaseUrl = () => (getEnv() === 'prod' ? MR_PROD_BASE_URL : MR_INTEGRATION_BASE_URL);

// Keeps each media-status URL a safe length; a MAX schedule has far fewer streams than this.
export const MAX_IDS_PER_REQUEST = 50;
// MobileRider's 404 body: "ID <id> not found in JSON data."
const UNKNOWN_ID_RE = /^ID (\S+) not found/;
export const MAX_UNKNOWN_ID_RETRIES = 3;

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
        const body = await response.json().catch(() => ({}));
        logError('mobile-rider-controller', 'getMediaStatus error', body);
        const error = new Error(body.message || 'Failed to get media status');
        error.status = response.status;
        throw error;
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

    await Promise.all(chunks.map((chunk) => this.checkChunk(chunk, statusMap)));

    return statusMap;
  }

  /**
   * Checks one chunk of ids and writes the results into statusMap. MobileRider fails the whole
   * request with a 404 naming the first unknown id, so that id is dropped and the rest retried;
   * past MAX_UNKNOWN_ID_RETRIES it falls back to one request per id, as before batching.
   * Network and 5xx failures leave the chunk inactive without retrying.
   * @param {string[]} ids
   * @param {Map<string, boolean>} statusMap
   * @param {number} retriesLeft
   */
  async checkChunk(ids, statusMap, retriesLeft = MAX_UNKNOWN_ID_RETRIES) {
    try {
      const { active } = await this.getMediaStatus(ids);
      const activeIds = new Set(Array.isArray(active) ? active : []);
      ids.forEach((id) => statusMap.set(id, activeIds.has(id)));
    } catch (error) {
      if (error.status !== 404 || ids.length < 2) return;
      const unknownId = UNKNOWN_ID_RE.exec(error.message || '')?.[1];
      if (retriesLeft > 0 && ids.includes(unknownId)) {
        await this.checkChunk(ids.filter((id) => id !== unknownId), statusMap, retriesLeft - 1);
        return;
      }
      await Promise.all(ids.map(async (id) => {
        statusMap.set(id, await this.isMediaActive(id));
      }));
    }
  }
}

export default MobileRiderController;
