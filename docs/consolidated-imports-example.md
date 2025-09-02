# Consolidated Imports Example

## Before (Multiple Imports)

Previously, consumers had to import from multiple modules:

```javascript
const [{
  setEventConfig,
  autoUpdateContent,
  getNonProdData,
  validatePageAndRedirect,
}, { lazyCaptureProfile }, { dictionaryManager }] = await Promise.all([
  import(`${LIBS}/utils/utils.js`),
  import(`${EVENT_LIBS}/utils/decorate.js`),
  import(`${EVENT_LIBS}/utils/profile.js`),
  import(`${EVENT_LIBS}/utils/dictionary-manager.js`),
]);
```

## After (Single Import)

Now consumers can import everything from a single module:

```javascript
const {
  setEventConfig,
  autoUpdateContent,
  getNonProdData,
  validatePageAndRedirect,
  lazyCaptureProfile,
  dictionaryManager,
  // Plus all other utilities
  LIBS,
  getEventServiceEnv,
  createTag,
  getMetadata,
  setMetadata,
  getProfile,
  DictionaryManager,
  getEvent,
  getEventAttendee,
  // ... and many more
  EVENT_BLOCKS, // Array of available event block names
} = await import(`${EVENT_LIBS}/libs.js`);
```

## Available Exports

The consolidated `libs.js` file exports all utilities from:

- `utils.js` - Core utility functions
- `decorate.js` - Event configuration and content management
- `profile.js` - User profile management
- `dictionary-manager.js` - Dictionary/translation management
- `esp-controller.js` - Event service API functions
- `data-utils.js` - Data transformation utilities

## Benefits

1. **Simplified imports** - Single import statement instead of multiple
2. **Better tree-shaking** - Bundlers can still optimize unused exports
3. **Easier maintenance** - No need to manage multiple import paths
4. **Consistent API** - All utilities available from one entry point
5. **Block discovery** - `EVENT_BLOCKS` constant provides list of available event blocks
