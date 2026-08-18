import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../event-libs/v1/utils/utils.js';
import {
  getJsonMetadata,
  getCustomAttributes,
  getCustomAttribute,
  getAttrValues,
  getAttrLabel,
  getAttrText,
} from '../../../../event-libs/v1/c2/utils/custom-attributes.js';

const ATTRS = [
  {
    attributeId: 'a1',
    name: 'Primary Event Site Track',
    inputType: 'single-select',
    enabled: true,
    values: [{ value: 'keynotes-sneaks', valueId: 'v1', label: 'Keynotes & Sneaks' }],
  },
  {
    attributeId: 'a2',
    name: 'Additional Event Site Tracks',
    inputType: 'multi-select',
    enabled: true,
    values: [
      { value: 'branding', valueId: 'v2', label: 'Branding' },
      { value: 'photography', valueId: 'v3', label: 'Photography' },
    ],
  },
  {
    attributeId: 'a3',
    name: 'Override Primary Event Site Track',
    inputType: 'text',
    enabled: true,
    values: [{ value: 'Mainstage Broadcast', _ordinal: null }],
  },
  {
    attributeId: 'a4',
    name: 'Disabled Attribute',
    inputType: 'text',
    enabled: false,
    values: [{ value: 'should be ignored', _ordinal: null }],
  },
];

describe('Custom Attributes Helper', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    setMetadata('custom-attributes', JSON.stringify(ATTRS));
  });

  describe('getCustomAttributes', () => {
    it('returns only enabled entries', () => {
      const all = getCustomAttributes();
      expect(all).to.have.lengthOf(3);
      expect(all.some((a) => a.name === 'Disabled Attribute')).to.be.false;
    });

    it('returns [] when the meta is absent', () => {
      document.head.innerHTML = '';
      expect(getCustomAttributes()).to.deep.equal([]);
    });
  });

  describe('getCustomAttribute', () => {
    it('finds an entry by name, case-insensitive', () => {
      expect(getCustomAttribute('primary event site track').name)
        .to.equal('Primary Event Site Track');
    });

    it('returns null for an unknown or disabled attribute', () => {
      expect(getCustomAttribute('Nope')).to.be.null;
      expect(getCustomAttribute('Disabled Attribute')).to.be.null;
    });

    it('returns null for an empty name', () => {
      expect(getCustomAttribute('')).to.be.null;
    });
  });

  describe('getAttrValues', () => {
    it('returns all { label, value } pairs for a multi-select', () => {
      expect(getAttrValues('Additional Event Site Tracks')).to.deep.equal([
        { label: 'Branding', value: 'branding' },
        { label: 'Photography', value: 'photography' },
      ]);
    });

    it('returns [] for an absent attribute', () => {
      expect(getAttrValues('Nope')).to.deep.equal([]);
    });
  });

  describe('getAttrLabel', () => {
    it('returns the first value label for a single-select', () => {
      expect(getAttrLabel('Primary Event Site Track')).to.equal('Keynotes & Sneaks');
    });

    it('returns "" for a text attribute (no label)', () => {
      expect(getAttrLabel('Override Primary Event Site Track')).to.equal('');
    });

    it('returns "" when absent', () => {
      expect(getAttrLabel('Nope')).to.equal('');
    });
  });

  describe('getAttrText', () => {
    it('returns the first raw value for a text attribute', () => {
      expect(getAttrText('Override Primary Event Site Track')).to.equal('Mainstage Broadcast');
    });

    it('returns the value key for a single-select', () => {
      expect(getAttrText('Primary Event Site Track')).to.equal('keynotes-sneaks');
    });
  });

  describe('getJsonMetadata', () => {
    it('parses a JSON metadata value', () => {
      setMetadata('speakers', JSON.stringify([{ firstName: 'Morgan' }]));
      expect(getJsonMetadata('speakers')).to.deep.equal([{ firstName: 'Morgan' }]);
    });

    it('returns the fallback when the key is missing', () => {
      expect(getJsonMetadata('missing', [])).to.deep.equal([]);
    });

    it('returns the fallback on invalid JSON', () => {
      setMetadata('broken', '{ not json');
      expect(getJsonMetadata('broken', null)).to.be.null;
    });
  });
});
