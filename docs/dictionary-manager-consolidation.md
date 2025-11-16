# DictionaryManager Consolidation

## Overview

The `DictionaryManager` class has been successfully implemented to provide a unified solution for key replacement functionality. The implementation fetches a multi-sheet dictionary from `event-libs/assets/configs/dictionary.json` using `import.meta.url` and integrates seamlessly with the existing event-libs architecture.

## Current Implementation

### 1. DictionaryManager Class

The `DictionaryManager` class in `event-libs/v1/utils/dictionary-manager.js` provides:

- **`initialize()`**: Load all dictionary sheets (one fetch loads everything)
- **`loadAllSheets()`**: Load all sheets from the dictionary JSON
- **`getValue(key, sheet)`**: Get value for a key from a specific dictionary sheet
- **`fetchDictionary()`**: Static method to fetch the multi-sheet dictionary.json (cached)
- **`getDictionaryPath()`**: Static method to get dictionary URL using import.meta.url

### 2. Integration with decorate.js

The `initRSVPHandler` function initializes the `DictionaryManager`:

```javascript
async function initRSVPHandler(link) {
  await dictionaryManager.initialize();
  // ... rest of the function
}
```

### 3. Usage Throughout the Codebase

The `DictionaryManager` is used directly throughout the codebase for key replacement:

```javascript
// Example from decorate.js
const registeredText = dictionaryManager.getValue('registered-cta-text');
const waitlistedText = dictionaryManager.getValue('waitlisted-cta-text');
const waitlistText = dictionaryManager.getValue('waitlist-cta-text');
const closedText = dictionaryManager.getValue('event-full-cta-text');
```

## Benefits of the Current Implementation

1. **Unified Interface**: All key replacement functionality is handled through a single `DictionaryManager` class
2. **Domain from Code**: Uses import.meta.url to get the domain where the code is hosted
3. **Locale-Aware**: Uses getLocale to determine the correct prefix for localized dictionaries
4. **Single Fetch, All Sheets**: One fetch loads all available sheets automatically
5. **Optimized Performance**: Smart caching with promise deduplication
6. **Simple API**: Just call `initialize()` once, no need to manage individual sheets
7. **Seamless Integration**: Works with existing event-libs architecture

## Usage

### For New Code

Use the `DictionaryManager` directly:

```javascript
import { dictionaryManager } from './dictionary-manager.js';

// Initialize - loads all sheets in one fetch
await dictionaryManager.initialize();

// Get value from data sheet (default)
const value = dictionaryManager.getValue('my-key');

// Get value from specific sheet
const fieldLabel = dictionaryManager.getValue('First name', 'rsvp-fields');
```

### Configuration

The `DictionaryManager` fetches dictionaries from `${domain}${prefix}/event-libs/assets/configs/dictionary.json`, where:
- `domain` is extracted from `import.meta.url` (e.g., `https://main--milo--adobecom.aem.page`)
- `prefix` is determined by locale using milo's `getLocale()` (e.g., `/fr`, `/de`, or empty string for en-US)

The dictionary.json file contains a multi-sheet structure:

```javascript
{
  "data": {
    "total": 12,
    "offset": 0,
    "limit": 12,
    "data": [
      { "key": "registered-cta-text", "value": "I'm going" },
      { "key": "waitlisted-cta-text", "value": "Added to waitlist" },
      // ... more entries
    ]
  },
  "rsvp-fields": {
    "total": 137,
    "offset": 0,
    "limit": 137,
    "data": [
      { "key": "First name", "value": "First name" },
      { "key": "Last name", "value": "Last name" },
      // ... more entries
    ]
  },
  ":version": 3,
  ":names": ["data", "rsvp-fields"],
  ":type": "multi-sheet"
}
```

The system uses 'data' for general dictionary entries and 'rsvp-fields' for form-specific translations.

## Testing

A test file `test/unit/scripts/dictionary-manager.test.js` verifies the functionality works correctly. The tests cover:

- Basic `getValue` functionality for both sheets
- Dictionary fetching and initialization
- Automatic loading of all sheets from single fetch
- Fetch caching and deduplication

## Architecture Notes

- **Direct Integration**: Dictionary functionality is integrated directly where needed
- **Clean Implementation**: Simple, focused class with clear responsibilities
- **Performance Optimized**: Uses frozen objects, efficient lookups, and fetch caching
- **Single Fetch**: All sheets are fetched in a single request and cached statically
- **Domain from Code**: Uses import.meta.url to get the hosting domain
- **Locale Support**: Uses milo's getLocale to determine the prefix for multi-locale support
- **External Content**: Dictionary is hosted in the content repo at `${domain}${prefix}/event-libs/assets/configs/dictionary.json`
