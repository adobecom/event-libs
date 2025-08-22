import { expect } from '@esm-bundle/chai';
import { DictionaryManager, dictionaryManager } from '../../../event-libs/scripts/dictionary-manager.js';

describe('DictionaryManager', () => {
  let manager;

  beforeEach(() => {
    manager = new DictionaryManager();
  });

  describe('getValue', () => {
    it('should return the key if no dictionary is loaded', () => {
      expect(manager.getValue('test-key')).to.equal('test-key');
    });

    it('should return the value if key exists in dictionary', async () => {
      // Mock the dictionary by calling fetchDictionary with mock data
      const mockResponse = { ok: true, json: () => Promise.resolve({ data: [{ key: 'test-key', value: 'test-value' }] }) };
      globalThis.fetch = () => Promise.resolve(mockResponse);
      
      await manager.fetchDictionary({ config: { locale: { contentRoot: '/content' } } });
      expect(manager.getValue('test-key')).to.equal('test-value');
    });
  });



  describe('static methods', () => {
    it('should construct correct placeholders path', () => {
      const config = { locale: { contentRoot: '/content' } };
      const path = DictionaryManager.getPlaceholdersPath(config, 'default');
      expect(path).to.equal('/content/placeholders.json');
    });

    it('should add sheet query parameter when sheet is provided', () => {
      const config = { locale: { contentRoot: '/content' } };
      const path = DictionaryManager.getPlaceholdersPath(config, 'custom-sheet');
      expect(path).to.equal('/content/placeholders.json?sheet=custom-sheet');
    });
  });
});

describe('dictionaryManager instance', () => {
  it('should be an instance of DictionaryManager', () => {
    expect(dictionaryManager).to.be.instanceOf(DictionaryManager);
  });
});
