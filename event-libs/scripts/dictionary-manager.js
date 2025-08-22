export class DictionaryManager {
  #dictionary = {};

  static getPlaceholdersPath(config, sheet) {
    const path = `${config.locale.contentRoot}/placeholders.json`;
    const query = sheet !== 'default' && typeof sheet === 'string' && sheet.length ? `?sheet=${sheet}` : '';
    return `${path}${query}`;
  }

  /**
   * Fetch dictionary from placeholders.json
   * @param {Object} params - Parameters for fetching dictionary
   * @param {Object} params.config - Milo configuration
   * @param {string} params.sheet - Sheet name (optional)
   */
  async fetchDictionary({ config, sheet }) {
    try {
      const path = DictionaryManager.getPlaceholdersPath(config, sheet);
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch dictionary: ${response.status}`);
      }
      const data = await response.json();
      this.#dictionary = Object.freeze(data.data.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {}));
    } catch (error) {
      window.lana?.log(`Error fetching dictionary:\n${JSON.stringify(error)}`);
      throw error;
    }
  }

  /**
   * Get value for a key from the dictionary
   * @param {string} key - The key to look up
   * @returns {string} The value for the key or the key itself if not found
   */
  getValue(key) {
    return this.#dictionary[key] || key;
  }

  /**
   * Initialize the dictionary manager with configuration
   * @param {Object} config - Milo configuration
   * @param {string} sheet - Sheet name (optional)
   */
  async initialize(config, sheet = 'default') {
    await this.fetchDictionary({ config, sheet });
  }
}

export const dictionaryManager = new DictionaryManager();
