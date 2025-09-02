# DictionaryManager Consolidation

## Overview

The `DictionaryManager` class has been successfully implemented to provide a unified solution for key replacement functionality. The implementation uses direct JSON fetching from placeholders.json files and integrates seamlessly with the existing event-libs architecture.

## Current Implementation

### 1. DictionaryManager Class

The `DictionaryManager` class in `event-libs/v1/utils/dictionary-manager.js` provides:

- **`initialize(config, sheet)`**: Convenience method to set up the manager and fetch the dictionary
- **`getValue(key)`**: Get value for a key from the dictionary
- **`fetchDictionary({ config, sheet })`: Fetch dictionary from placeholders.json

### 2. Integration with decorate.js

The `decorateArea` function initializes the `DictionaryManager` with configuration:

```javascript
export default async function decorateArea(area = document) {
  // Initialize DictionaryManager with configuration
  try {
    const { miloConfig } = getEventConfig();
    await dictionaryManager.initialize(miloConfig);
  } catch (error) {
    window.lana?.log(`Failed to initialize DictionaryManager:\n${JSON.stringify(error, null, 2)}`);
  }
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
2. **Simplified Architecture**: Uses direct JSON fetching from placeholders.json files
3. **Better Performance**: Provides efficient dictionary lookups
4. **Simplified Code**: Clean, maintainable implementation
5. **Reduced Dependencies**: No external library dependencies
6. **Seamless Integration**: Works with existing event-libs architecture

## Usage

### For New Code

Use the `DictionaryManager` directly:

```javascript
import { dictionaryManager } from './dictionary-manager.js';

// Initialize (usually done once in decorateArea)
await dictionaryManager.initialize(config);

// Use for key replacement
const value = dictionaryManager.getValue('my-key');
```

### Configuration

The `DictionaryManager` expects a configuration object with:

```javascript
{
  locale: {
    contentRoot: '/path/to/content/root'
  }
}
```

## Testing

A test file `test/unit/scripts/dictionary-manager.test.js` verifies the functionality works correctly. The tests cover:

- Basic `getValue` functionality
- Dictionary fetching and initialization
- Static method functionality

## Architecture Notes

- **Direct Integration**: Dictionary functionality is integrated directly where needed
- **Clean Implementation**: Simple, focused class with clear responsibilities
- **Performance Optimized**: Uses frozen objects and efficient lookups
