export class DictionaryManager {
  #dictionaries = {};

  static getPlaceholdersPath(config, sheet) {
    const path = `${config.locale.contentRoot}/placeholders.json`;
    const query = sheet !== 'default' && typeof sheet === 'string' && sheet.length ? `?sheet=${sheet}` : '';
    return `${path}${query}`;
  }

  /**
   * Add a new dictionary book from placeholders.json
   * @param {Object} params - Parameters for adding dictionary book
   * @param {Object} params.config - Milo configuration
   * @param {string} params.sheet - Sheet name (optional)
   */
  async addBook({ config, sheet = 'default' }) {
    try {
      const path = DictionaryManager.getPlaceholdersPath(config, sheet);
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch dictionary: ${response.status}`);
      }
      const json = await response.json();
      const data = json[':type'] && json[':type'] === 'multi-sheet' ? json.data.data : json.data;
      const dictionary = data.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {});
      
      // Store dictionary for this specific sheet
      this.#dictionaries[sheet] = Object.freeze(dictionary);
    } catch (error) {
      window.lana?.log(`Error adding dictionary book:\n${JSON.stringify(error)}`);
      throw error;
    }
  }

  /**
   * Get value for a key from a specific sheet's dictionary
   * @param {string} key - The key to look up
   * @param {string} sheet - The sheet name to look in (defaults to 'default')
   * @returns {string} The value for the key or the key itself if not found
   */
  getValue(key, sheet = 'default') {
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
   * @param {string} sheet - The sheet name (defaults to 'default')
   * @returns {string[]} Array of keys in the sheet
   */
  getKeys(sheet = 'default') {
    const dictionary = this.#dictionaries[sheet];
    return dictionary ? Object.keys(dictionary) : [];
  }

  /**
   * Initialize the dictionary manager with configuration
   * @param {Object} config - Milo configuration
   * @param {string} sheet - Sheet name (optional)
   */
  async initialize(config, sheet = 'default') {
    await this.addBook({ config, sheet });
  }
}

export const dictionaryManager = new DictionaryManager();
