import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import {
  renderGdprCopy,
  renderClosedCaption,
  renderLegalDisclaimer,
} from '../../../../../event-libs/v1/c2/blocks/event-session-details/disclaimer-cc-legal.js';

const attr = (name, value) => ({ name, inputType: 'text', enabled: true, values: [{ value }] });

function setAttrs(list) {
  setMetadata('custom-attributes', JSON.stringify(list));
}

describe('Disclaimer / CC / Legal slots', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  describe('renderGdprCopy', () => {
    it('renders the IPOD/GDPR copy verbatim when populated', () => {
      setAttrs([attr('IPOD or GDPR Copy', 'Favorite this session to get notified.')]);
      const el = renderGdprCopy();
      expect(el.classList.contains('session-gdpr-copy')).to.be.true;
      expect(el.textContent).to.equal('Favorite this session to get notified.');
    });

    it('returns null when absent', () => {
      setAttrs([]);
      expect(renderGdprCopy()).to.be.null;
    });
  });

  describe('renderClosedCaption', () => {
    it('renders text with a CC icon when populated', () => {
      setAttrs([attr('Closed Caption Information', 'Closed captions in English will be available soon.')]);
      const el = renderClosedCaption();
      expect(el.classList.contains('session-closed-caption')).to.be.true;
      expect(el.querySelector('.session-cc-icon svg')).to.not.be.null;
      expect(el.querySelector('.session-cc-text').textContent)
        .to.equal('Closed captions in English will be available soon.');
    });

    it('returns null when absent', () => {
      setAttrs([]);
      expect(renderClosedCaption()).to.be.null;
    });
  });

  describe('renderLegalDisclaimer', () => {
    it('renders the legal disclaimer verbatim when populated', () => {
      setAttrs([attr('Legal Disclaimer', 'test legal')]);
      const el = renderLegalDisclaimer();
      expect(el.classList.contains('session-legal-disclaimer')).to.be.true;
      expect(el.textContent).to.equal('test legal');
    });

    it('returns null when absent', () => {
      setAttrs([]);
      expect(renderLegalDisclaimer()).to.be.null;
    });
  });
});
