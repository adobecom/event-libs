import { expect } from '@esm-bundle/chai';
import { sanitizedRichText } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/rich-text.js';

// The real `Legal Disclaimer` value from the ESP catalog.
const REAL = '<p><b>This content is copyrighted by Adobe Inc. Any recording and posting of this content is strictly prohibited.</b></p><br/> <p><b>By accessing resources linked on this page ("Session Resources"), you agree that 1. Resources are Sample Files per our <a href="https://www.adobe.com/legal/terms.html">Terms of Use</a> and 2. you will use Session Resources solely as directed by the applicable speaker.</b></p>';

describe('sessions-guide/utils/rich-text', () => {
  describe('sanitizedRichText', () => {
    it('is empty for every falsy input, rather than throwing', () => {
      ['', null, undefined, 0, false].forEach((v) => {
        expect(sanitizedRichText(v)).to.equal('');
      });
    });

    it('keeps the markup the real disclaimer is built from', () => {
      const out = sanitizedRichText(REAL);
      expect(out).to.include('<p>');
      expect(out).to.include('<b>');
      expect(out).to.include('<br>');
      expect(out).to.include('This content is copyrighted by Adobe Inc.');
      expect(out).to.include('href="https://www.adobe.com/legal/terms.html"');
      expect(out).to.include('Terms of Use');
    });

    it('opens links in a new tab, with noopener noreferrer', () => {
      const out = sanitizedRichText(REAL);
      expect(out).to.include('target="_blank"');
      expect(out).to.include('rel="noopener noreferrer"');
    });

    // Author-controlled, but it still crosses the wire from a service.
    it('drops a script tag and its contents', () => {
      const out = sanitizedRichText('<p>Legal.</p><script>window.pwned = true;</script>');
      expect(out).to.include('Legal.');
      expect(out).to.not.include('script');
      expect(out).to.not.include('pwned');
      expect(window.pwned).to.be.undefined;
    });

    it('strips inline event handlers', () => {
      const out = sanitizedRichText('<p onclick="window.pwned = true">Legal.</p>');
      expect(out).to.include('Legal.');
      expect(out).to.not.include('onclick');
    });

    it('strips a javascript: href but keeps the link text', () => {
      /* eslint-disable-next-line no-script-url */
      const out = sanitizedRichText('<a href="javascript:alert(1)">Terms</a>');
      expect(out).to.not.include('javascript:');
      expect(out).to.include('Terms');
    });

    it('strips an iframe', () => {
      const out = sanitizedRichText('<p>Legal.</p><iframe src="https://evil.example.com"></iframe>');
      expect(out).to.not.include('iframe');
      expect(out).to.include('Legal.');
    });

    it('leaves plain text alone, so a non-HTML value still renders', () => {
      expect(sanitizedRichText('test legal disclaimer')).to.equal('test legal disclaimer');
    });

    // The anchor pass is skipped when there is nothing to rewrite, so this path must still
    // return the sanitized string rather than the raw input.
    it('sanitizes even when there are no links to rewrite', () => {
      const out = sanitizedRichText('<p>Legal.</p><script>1;</script>');
      expect(out).to.not.include('script');
    });
  });
});
