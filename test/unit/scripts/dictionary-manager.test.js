import { expect } from '@esm-bundle/chai';
import { DictionaryManager, dictionaryManager, getInviteOnlyNoCampaignMessage } from '../../../event-libs/v1/utils/dictionary-manager.js';
import { setEventConfig } from '../../../event-libs/v1/utils/utils.js';

describe('DictionaryManager', () => {
  let manager;
  let originalFetch;

  beforeEach(() => {
    manager = new DictionaryManager();
    originalFetch = globalThis.fetch;
    
    // Set up event config with mock milo config
    setEventConfig({}, {
      miloLibs: 'http://localhost:2000/test/unit/blocks/promotional-content/mocks/libs',
      locales: { '': { ietf: 'en-US', tk: 'hah7vzn.css' } }
    });
    
    // Clear the static cache before each test
    DictionaryManager._clearCache?.();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getValue', () => {
    it('should return the key if no dictionary is loaded', () => {
      expect(manager.getValue('test-key')).to.equal('test-key');
    });

    it('should return the value if key exists in dictionary', async () => {
      // Mock the dictionary with new multi-sheet structure
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: {
            total: 1,
            offset: 0,
            limit: 1,
            data: [{ key: 'test-key', value: 'test-value' }]
          },
          'rsvp-fields': {
            total: 0,
            offset: 0,
            limit: 0,
            data: []
          },
          ':version': 3,
          ':names': ['data', 'rsvp-fields'],
          ':type': 'multi-sheet'
        })
      };
      globalThis.fetch = () => Promise.resolve(mockResponse);
      
      await manager.initialize();
      expect(manager.getValue('test-key')).to.equal('test-value');
    });

    it('should return value from rsvp-fields sheet', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: {
            total: 0,
            offset: 0,
            limit: 0,
            data: []
          },
          'rsvp-fields': {
            total: 1,
            offset: 0,
            limit: 1,
            data: [{ key: 'field-key', value: 'field-value' }]
          },
          ':version': 3,
          ':names': ['data', 'rsvp-fields'],
          ':type': 'multi-sheet'
        })
      };
      globalThis.fetch = () => Promise.resolve(mockResponse);
      
      await manager.initialize();
      expect(manager.getValue('field-key', 'rsvp-fields')).to.equal('field-value');
    });
  });

  describe('loadAllSheets', () => {
    it('should load all sheets from single fetch', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: {
            total: 1,
            offset: 0,
            limit: 1,
            data: [{ key: 'data-key', value: 'data-value' }]
          },
          'rsvp-fields': {
            total: 1,
            offset: 0,
            limit: 1,
            data: [{ key: 'rsvp-key', value: 'rsvp-value' }]
          },
          ':version': 3,
          ':names': ['data', 'rsvp-fields'],
          ':type': 'multi-sheet'
        })
      };
      
      let fetchCount = 0;
      globalThis.fetch = () => {
        fetchCount++;
        return Promise.resolve(mockResponse);
      };
      
      // Initialize loads all sheets
      await manager.initialize();
      
      // Should only fetch once and load both sheets
      expect(fetchCount).to.equal(1);
      expect(manager.getValue('data-key')).to.equal('data-value');
      expect(manager.getValue('rsvp-key', 'rsvp-fields')).to.equal('rsvp-value');
      expect(manager.hasSheet('data')).to.be.true;
      expect(manager.hasSheet('rsvp-fields')).to.be.true;
    });
  });
});

describe('dictionaryManager instance', () => {
  it('should be an instance of DictionaryManager', () => {
    expect(dictionaryManager).to.be.instanceOf(DictionaryManager);
  });
});

describe('getInviteOnlyNoCampaignMessage', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    DictionaryManager._clearCache();
    setEventConfig({}, {
      miloLibs: 'http://localhost:2000/test/unit/blocks/promotional-content/mocks/libs',
      locales: { '': { ietf: 'en-US', tk: 'hah7vzn.css' } },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    DictionaryManager._clearCache();
  });

  it('returns fallback English copy when key is not in dictionary', () => {
    const manager = new DictionaryManager();
    expect(getInviteOnlyNoCampaignMessage(manager)).to.equal(
      'Registration is only available through a valid invitation link.',
    );
  });

  it('returns configured dictionary value when present', async () => {
    const manager = new DictionaryManager();
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        data: {
          total: 1,
          offset: 0,
          limit: 1,
          data: [{ key: 'rsvp-invite-only-no-campaign-cta-text', value: 'Invitation-only copy from sheet.' }],
        },
        ':version': 3,
        ':names': ['data'],
        ':type': 'multi-sheet',
      }),
    };
    globalThis.fetch = () => Promise.resolve(mockResponse);
    await manager.initialize();
    expect(getInviteOnlyNoCampaignMessage(manager)).to.equal('Invitation-only copy from sheet.');
  });
});
