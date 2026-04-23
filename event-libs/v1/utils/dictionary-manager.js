import { LIBS, getEventConfig, getMetadata } from './utils.js';
import { FALLBACK_LOCALES } from './constances.js';

export class DictionaryManager {
  #dictionaries = {};
  static #dictionaryCache = null;
  static #dictionaryPromise = null;

  /**
   * Get the dictionary URL using import.meta.url for domain and getLocale for prefix
   * @returns {Promise<string>} The dictionary URL
   */
  static async getDictionaryPath() {
    const customDictionaryLocation = getMetadata('dictionary-location');
    if (customDictionaryLocation) {
      return customDictionaryLocation;
    }

    const eventConfig = getEventConfig();
    const { miloConfig } = eventConfig;
    const miloLibs = miloConfig?.miloLibs ? miloConfig.miloLibs : LIBS;
    const { getLocale } = await import(`${miloLibs}/utils/utils.js`);
    
    const { prefix } = getLocale(miloConfig?.locales || FALLBACK_LOCALES);
    
    // Get the domain from import.meta.url
    const moduleUrl = new URL(import.meta.url);
    const domain = `${moduleUrl.protocol}//${moduleUrl.host}`;
    
    return `${domain}${prefix}/event-libs/assets/configs/dictionary.json`;
  }

  /**
   * Fetch the dictionary JSON once and cache it
   * @returns {Promise<Object>} The dictionary JSON
   */
  static async fetchDictionary() {
    // Return cached dictionary if available
    if (DictionaryManager.#dictionaryCache) {
      return DictionaryManager.#dictionaryCache;
    }

    // Return existing promise if fetch is in progress
    if (DictionaryManager.#dictionaryPromise) {
      return DictionaryManager.#dictionaryPromise;
    }

    // Start new fetch
    DictionaryManager.#dictionaryPromise = (async () => {
      try {
        const path = await DictionaryManager.getDictionaryPath();
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`Failed to fetch dictionary: ${response.status}`);
        }
        const json = await response.json();
        DictionaryManager.#dictionaryCache = json;
        return json;
      } catch (error) {
        window.lana?.log(`Error fetching dictionary:\n${JSON.stringify(error)}`);
        // Clear the promise so retry is possible
        DictionaryManager.#dictionaryPromise = null;
        throw error;
      }
    })();

    return DictionaryManager.#dictionaryPromise;
  }

  /**
   * Load all sheets from the dictionary JSON
   * Since we fetch all sheets in one JSON, we load them all at once
   */
  async loadAllSheets() {
    // Skip if already loaded
    if (Object.keys(this.#dictionaries).length > 0) {
      return;
    }

    try {
      const json = await DictionaryManager.fetchDictionary();
      
      // Get all sheet names from the JSON
      const sheetNames = json[':names'] || [];
      
      // Load each sheet
      sheetNames.forEach((sheetName) => {
        const sheetData = json[sheetName];
        if (sheetData && sheetData.data) {
          const data = sheetData.data;
          const dictionary = data.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
          }, {});
          
          this.#dictionaries[sheetName] = Object.freeze(dictionary);
        }
      });
    } catch (error) {
      window.lana?.log(`Error loading dictionary sheets:\n${JSON.stringify(error)}`);
      throw error;
    }
  }

  /**
   * Get value for a key from a specific sheet's dictionary
   * @param {string} key - The key to look up
   * @param {string} sheet - The sheet name to look in (defaults to 'data')
   * @returns {string} The value for the key or the key itself if not found
   */
  getValue(key, sheet = 'data') {
    const dictionary = this.#dictionaries[sheet];
    return dictionary?.[key] || key;
  }

  /**
   * Get all available sheet names
   * @returns {string[]} Array of sheet names that have been loaded
   */
  getAvailableSheets() {
    return Object.keys(this.#dictionaries);
  }

  /**
   * Check if a sheet has been loaded
   * @param {string} sheet - The sheet name to check
   * @returns {boolean} True if the sheet has been loaded
   */
  hasSheet(sheet) {
    return sheet in this.#dictionaries;
  }

  /**
   * Get all keys for a specific sheet
   * @param {string} sheet - The sheet name (defaults to 'data')
   * @returns {string[]} Array of keys in the sheet
   */
  getKeys(sheet = 'data') {
    const dictionary = this.#dictionaries[sheet];
    return dictionary ? Object.keys(dictionary) : [];
  }

  /**
   * Initialize the dictionary manager by loading all sheets
   */
  async initialize() {
    await this.loadAllSheets();
  }

  /**
   * Clear the dictionary cache (for testing purposes)
   * @private
   */
  static _clearCache() {
    DictionaryManager.#dictionaryCache = null;
    DictionaryManager.#dictionaryPromise = null;
  }
}

export const dictionaryManager = new DictionaryManager();
