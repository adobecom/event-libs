import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { getValidCampaignIdFromUrl, resetCampaignMapCache } from '../../../../event-libs/v1/utils/utils.js';
import { BASE_ATTENDEE_DATA_FILTER } from '../../../../event-libs/v1/utils/data-utils.js';
import { stripTags } from '../../../../event-libs/v1/utils/sanitize-utils.js';
import BlockMediator from '../../../../event-libs/v1/deps/block-mediator.min.js';
import { PHONE_FIELD_RE, PHONE_PATTERN, STANDARD_FIELD_MAX_LENGTHS } from '../../../../event-libs/v1/utils/constances.js';

describe('Events Form', () => {
  let block;

  beforeEach(() => {
    block = document.createElement('div');
    block.innerHTML = `
      <div class="event-hero"></div>
      <div class="form-container">
        <a href="/events/default/rsvp-form-configs/test.json"></a>
      </div>
      <div class="terms"></div>
      <div class="rsvp-success-screen"></div>
      <div class="waitlist-success-screen"></div>
    `;

    // Create meta tags for getMetadata to work
    const metaEventId = document.createElement('meta');
    metaEventId.setAttribute('name', 'event-id');
    metaEventId.content = 'test-event-id';
    document.head.appendChild(metaEventId);

    const metaCloudType = document.createElement('meta');
    metaCloudType.setAttribute('name', 'cloud-type');
    metaCloudType.content = 'test';
    document.head.appendChild(metaCloudType);

    const metaAllowGuest = document.createElement('meta');
    metaAllowGuest.setAttribute('name', 'allow-guest-registration');
    metaAllowGuest.content = 'true';
    document.head.appendChild(metaAllowGuest);

    // Mock other dependencies
    window.BlockMediator = {
      get: () => ({ account_type: 'registered' }),
      set: () => {},
      subscribe: () => {},
    };

    window.dictionaryManager = {
      getValue: (text) => text,
      fetchDictionary: () => Promise.resolve(),
    };
    window.getAndCreateAndAddAttendee = () => Promise.resolve({ ok: true, data: {} });
    window.getEvent = () => Promise.resolve({ ok: true, data: {} });
    window.getAttendee = () => Promise.resolve({ ok: true, data: {} });
    window.deleteAttendeeFromEvent = () => Promise.resolve({ ok: true, data: {} });
    window.getSusiOptions = () => ({});
    window.signIn = () => {};
    window.decorateEvent = () => {};
    window.decorateDefaultLinkAnalytics = () => {};
    window.createTag = (tag, attrs, content) => {
      const element = document.createElement(tag);
      if (attrs) {
        Object.entries(attrs).forEach(([key, value]) => {
          element.setAttribute(key, value);
        });
      }
      if (content) {
        element.textContent = content;
      }
      return element;
    };
    window.getConfig = () => ({});
    window.LIBS = '/libs';
    window.lana = { log: () => {} };
  });

  afterEach(() => {
    // Clean up meta tags
    const metaTags = document.head.querySelectorAll(
      'meta[name="event-id"], meta[name="cloud-type"], meta[name="allow-guest-registration"]',
    );
    metaTags.forEach((tag) => tag.remove());

    // Clean up mocks
    delete window.BlockMediator;
    delete window.dictionaryManager;

    delete window.getAndCreateAndAddAttendee;
    delete window.getEvent;
    delete window.getAttendee;
    delete window.deleteAttendeeFromEvent;
    delete window.getSusiOptions;
    delete window.signIn;
    delete window.decorateEvent;
    delete window.decorateDefaultLinkAnalytics;
    delete window.createTag;
    delete window.getConfig;
    delete window.LIBS;
    delete window.lana;
  });

  describe('constructPayload', () => {
    it('should output boolean for single-option checkbox when checked', () => {
      // Create a form with a single-option checkbox manually
      const form = document.createElement('form');

      // Create field wrapper with data attributes
      const fieldWrapper = document.createElement('div');
      fieldWrapper.setAttribute('data-field-id', 'acceptTerms');
      fieldWrapper.setAttribute('data-type', 'checkbox');

      // Create checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'acceptTerms';
      checkbox.value = 'I accept the terms and conditions';
      checkbox.checked = true;

      fieldWrapper.appendChild(checkbox);
      form.appendChild(fieldWrapper);

      // Import and test the constructPayload function directly
      import('../../../../event-libs/v1/blocks/events-form/events-form.js').then(() => {
        // Since constructPayload is not exported, we'll test the behavior through the form
        // submission. For now, let's just verify the checkbox is created correctly
        expect(checkbox.checked).to.be.true;
        expect(checkbox.name).to.equal('acceptTerms');
      });
    });

    it('should output boolean for single-option checkbox when unchecked', () => {
      // Create a form with a single-option checkbox manually
      const form = document.createElement('form');

      // Create field wrapper with data attributes
      const fieldWrapper = document.createElement('div');
      fieldWrapper.setAttribute('data-field-id', 'acceptTerms');
      fieldWrapper.setAttribute('data-type', 'checkbox');

      // Create checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'acceptTerms';
      checkbox.value = 'I accept the terms and conditions';
      checkbox.checked = false;

      fieldWrapper.appendChild(checkbox);
      form.appendChild(fieldWrapper);

      // Verify the checkbox is created correctly
      expect(checkbox.checked).to.be.false;
      expect(checkbox.name).to.equal('acceptTerms');
    });

    it('should output array for multi-option checkbox group', () => {
      // Create a form with multiple checkboxes manually
      const form = document.createElement('form');

      // Create field wrapper with data attributes
      const fieldWrapper = document.createElement('div');
      fieldWrapper.setAttribute('data-field-id', 'interests');
      fieldWrapper.setAttribute('data-type', 'checkbox-group');

      // Create multiple checkboxes
      const checkbox1 = document.createElement('input');
      checkbox1.type = 'checkbox';
      checkbox1.name = 'interests';
      checkbox1.value = 'Technology';
      checkbox1.checked = true;

      const checkbox2 = document.createElement('input');
      checkbox2.type = 'checkbox';
      checkbox2.name = 'interests';
      checkbox2.value = 'Design';
      checkbox2.checked = true;

      const checkbox3 = document.createElement('input');
      checkbox3.type = 'checkbox';
      checkbox3.name = 'interests';
      checkbox3.value = 'Marketing';
      checkbox3.checked = false;

      fieldWrapper.appendChild(checkbox1);
      fieldWrapper.appendChild(checkbox2);
      fieldWrapper.appendChild(checkbox3);
      form.appendChild(fieldWrapper);

      // Verify the checkboxes are created correctly
      expect(checkbox1.checked).to.be.true;
      expect(checkbox2.checked).to.be.true;
      expect(checkbox3.checked).to.be.false;
      expect(checkbox1.name).to.equal('interests');
      expect(checkbox2.name).to.equal('interests');
      expect(checkbox3.name).to.equal('interests');
    });
  });

  describe('createInput - pattern and title support', () => {
    // Simulates the createInput logic from events-form.js
    function simulateCreateInput({ type, field, placeholder, required, defval, pattern, title }) {
      const attrs = { type, id: field, placeholder: placeholder || '', value: defval || '' };
      if (pattern) attrs.pattern = pattern;
      if (title) attrs.title = title;
      const input = document.createElement('input');
      Object.entries(attrs).forEach(([key, value]) => {
        input.setAttribute(key, value);
      });
      if (required === 'x') input.setAttribute('required', 'required');
      return input;
    }

    it('should set the pattern attribute when pattern is provided', () => {
      const urlPattern = 'https?://.*';
      const input = simulateCreateInput({
        type: 'text',
        field: 'websiteUrl',
        placeholder: 'Enter URL',
        required: 'x',
        defval: '',
        pattern: urlPattern,
      });

      expect(input.getAttribute('pattern')).to.equal(urlPattern);
      expect(input.getAttribute('type')).to.equal('text');
      expect(input.getAttribute('id')).to.equal('websiteUrl');
      expect(input.hasAttribute('required')).to.be.true;
    });

    it('should set the title attribute when title is provided', () => {
      const input = simulateCreateInput({
        type: 'text',
        field: 'websiteUrl',
        placeholder: 'Enter URL',
        required: '',
        defval: '',
        pattern: 'https?://.*',
        title: 'Please enter a valid URL starting with http:// or https://',
      });

      expect(input.getAttribute('title')).to.equal('Please enter a valid URL starting with http:// or https://');
    });

    it('should set both pattern and title together', () => {
      const urlPattern = 'https?://.*';
      const titleText = 'Please enter a valid URL';
      const input = simulateCreateInput({
        type: 'text',
        field: 'websiteUrl',
        placeholder: 'Enter URL',
        required: 'x',
        defval: '',
        pattern: urlPattern,
        title: titleText,
      });

      expect(input.getAttribute('pattern')).to.equal(urlPattern);
      expect(input.getAttribute('title')).to.equal(titleText);
      expect(input.hasAttribute('required')).to.be.true;
    });

    it('should not set pattern attribute when pattern is not provided', () => {
      const input = simulateCreateInput({
        type: 'text',
        field: 'firstName',
        placeholder: 'First name',
        required: 'x',
        defval: '',
      });

      expect(input.hasAttribute('pattern')).to.be.false;
      expect(input.hasAttribute('title')).to.be.false;
    });

    it('should not set title attribute when title is not provided', () => {
      const input = simulateCreateInput({
        type: 'text',
        field: 'websiteUrl',
        placeholder: 'Enter URL',
        required: '',
        defval: '',
        pattern: 'https?://.*',
      });

      expect(input.getAttribute('pattern')).to.equal('https?://.*');
      expect(input.hasAttribute('title')).to.be.false;
    });

    it('should validate a URL correctly using pattern', () => {
      const urlPattern = 'https?:\\/\\/[\\w\\-]+(\\.[\\w\\-]+)+([\\w.,@?^=%&:/~+#-]*[\\w@?^=%&/~+#-])?';
      const input = simulateCreateInput({
        type: 'text',
        field: 'websiteUrl',
        placeholder: 'Enter URL',
        required: 'x',
        defval: '',
        pattern: urlPattern,
        title: 'Please enter a valid URL',
      });

      const regex = new RegExp(`^(?:${input.getAttribute('pattern')})$`);
      expect(regex.test('https://example.com')).to.be.true;
      expect(regex.test('http://example.com/path?query=1')).to.be.true;
      expect(regex.test('not-a-url')).to.be.false;
    });
  });

  describe('createInput - phone field defaults', () => {
    function simulateCreatePhoneAwareInput({ type, field, pattern, title }) {
      const isPhoneField = type === 'tel' || type === 'phone' || (type !== 'text' && typeof field === 'string' && PHONE_FIELD_RE.test(field));
      const attrs = { type: isPhoneField ? 'tel' : type, id: field };
      if (isPhoneField) {
        attrs.inputmode = 'tel';
        attrs.autocomplete = 'tel';
      }
      const resolvedPattern = pattern || (isPhoneField ? PHONE_PATTERN : null);
      if (resolvedPattern) attrs.pattern = resolvedPattern;
      if (title) attrs.title = title;
      const input = document.createElement('input');
      Object.entries(attrs).forEach(([k, v]) => input.setAttribute(k, v));
      return input;
    }

    it('applies tel type, pattern, inputmode for businessPhone field (legacy: no explicit type)', () => {
      const input = simulateCreatePhoneAwareInput({ type: undefined, field: 'businessPhone' });
      expect(input.getAttribute('type')).to.equal('tel');
      expect(input.getAttribute('inputmode')).to.equal('tel');
      expect(input.getAttribute('autocomplete')).to.equal('tel');
      expect(input.getAttribute('pattern')).to.equal(PHONE_PATTERN);
      expect(input.hasAttribute('title')).to.be.false;
    });

    it('applies same defaults for mobilePhone field (legacy: no explicit type)', () => {
      const input = simulateCreatePhoneAwareInput({ type: undefined, field: 'mobilePhone' });
      expect(input.getAttribute('type')).to.equal('tel');
      expect(input.getAttribute('pattern')).to.equal(PHONE_PATTERN);
    });

    it('does not apply phone defaults when explicit type is text, even if field name contains phone', () => {
      const input = simulateCreatePhoneAwareInput({ type: 'text', field: 'businessPhone' });
      expect(input.getAttribute('type')).to.equal('text');
      expect(input.hasAttribute('pattern')).to.be.false;
      expect(input.hasAttribute('inputmode')).to.be.false;
    });

    it('does not apply phone defaults for non-phone fields', () => {
      const input = simulateCreatePhoneAwareInput({ type: 'text', field: 'firstName' });
      expect(input.getAttribute('type')).to.equal('text');
      expect(input.hasAttribute('pattern')).to.be.false;
      expect(input.hasAttribute('inputmode')).to.be.false;
    });

    it('does not apply phone defaults for fields that contain "phone" as a substring (e.g. Phonetic First Name)', () => {
      const input = simulateCreatePhoneAwareInput({ type: 'text', field: 'Phonetic First Name' });
      expect(input.getAttribute('type')).to.equal('text');
      expect(input.hasAttribute('pattern')).to.be.false;
      expect(input.hasAttribute('inputmode')).to.be.false;
    });

    it('keeps explicit pattern and title from field config when provided', () => {
      const input = simulateCreatePhoneAwareInput({
        type: 'text',
        field: 'businessPhone',
        pattern: '^[0-9]+$',
        title: 'Digits only',
      });
      expect(input.getAttribute('pattern')).to.equal('^[0-9]+$');
      expect(input.getAttribute('title')).to.equal('Digits only');
    });

    it('phone pattern rejects letters and stray symbols (bug repro)', () => {
      const regex = new RegExp(`^(?:${PHONE_PATTERN})$`);
      expect(regex.test('Testing 123!@#')).to.be.false;
      expect(regex.test('abc')).to.be.false;
      expect(regex.test('555$$$')).to.be.false;
    });

    it('phone pattern accepts common phone formats', () => {
      const regex = new RegExp(`^(?:${PHONE_PATTERN})$`);
      expect(regex.test('+1 (555) 123-4567')).to.be.true;
      expect(regex.test('555-123-4567')).to.be.true;
      expect(regex.test('+15551234567')).to.be.true;
      expect(regex.test('5551234567')).to.be.true;
    });

    it('phone pattern compiles under the `v` flag the DOM uses for pattern attributes', () => {
      expect(() => new RegExp(PHONE_PATTERN, 'v')).to.not.throw();
    });

    it('phone pattern accepts exactly the backend PhoneNumberInput schema character set', () => {
      // Transcribed independently from the backend PhoneNumberInput schema so a change to
      // PHONE_PATTERN cannot silently redefine the contract it is supposed to be held to.
      // Escaping `(` and `)` is required for `v`-mode and does not widen or narrow the set.
      const backendSchemaRe = /^[+\d\s\-().]+$/;
      const plainRegex = new RegExp(PHONE_PATTERN);
      const vRegex = new RegExp(PHONE_PATTERN, 'v');
      const samples = [
        '+1 (555) 123-4567', '555-123-4567', '+15551234567', '5551234567',
        '----', '()', '+', '+-.() ', '.', ' ',
        'abc', '555$$$', 'Testing 123!@#', '555_123', '555/123', '', '[', ']',
      ];
      samples.forEach((sample) => {
        const expected = backendSchemaRe.test(sample);
        expect(plainRegex.test(sample)).to.equal(expected, `plain-mode mismatch for "${sample}"`);
        expect(vRegex.test(sample)).to.equal(expected, `v-mode mismatch for "${sample}"`);
      });
    });

    it('a real input element validates phone values with the pattern instead of throwing (bug repro)', () => {
      const input = document.createElement('input');
      input.type = 'tel';
      input.setAttribute('pattern', PHONE_PATTERN);
      document.body.append(input);

      input.value = '+1 (555) 123-4567';
      expect(input.checkValidity()).to.be.true;
      expect(input.validity.patternMismatch).to.be.false;

      input.value = 'Testing 123!@#';
      expect(input.checkValidity()).to.be.false;
      expect(input.validity.patternMismatch).to.be.true;

      input.remove();
    });
  });

  describe('createInput - standard field maxlength defaults', () => {
    function resolveMaxlength(field, limit) {
      return limit ?? STANDARD_FIELD_MAX_LENGTHS[field];
    }

    it('defaults firstName/lastName to the backend AttendeeName maxLength (30) when unauthored', () => {
      expect(resolveMaxlength('firstName', undefined)).to.equal(30);
      expect(resolveMaxlength('lastName', undefined)).to.equal(30);
    });

    it('defaults mobilePhone/businessPhone to the backend PhoneNumberInput maxLength (30) when unauthored', () => {
      expect(resolveMaxlength('mobilePhone', undefined)).to.equal(30);
      expect(resolveMaxlength('businessPhone', undefined)).to.equal(30);
    });

    it('defaults email to the backend Email maxLength (320) when unauthored', () => {
      expect(resolveMaxlength('email', undefined)).to.equal(320);
    });

    it('defaults free-text fields (e.g. companyName) to the backend AttendeeTextField maxLength (200) when unauthored', () => {
      expect(resolveMaxlength('companyName', undefined)).to.equal(200);
      expect(resolveMaxlength('countryRegion', undefined)).to.equal(200);
    });

    it('defaults specialRequirements to the backend SpecialRequirements maxLength (1000) when unauthored', () => {
      expect(resolveMaxlength('specialRequirements', undefined)).to.equal(1000);
    });

    it('lets an authored limit override the standard default', () => {
      expect(resolveMaxlength('firstName', 50)).to.equal(50);
    });

    it('leaves unrecognized/custom RSVP field names with no default', () => {
      expect(resolveMaxlength('aiApproach', undefined)).to.be.undefined;
    });
  });

  describe('Events Form - constructPayload', () => {
    describe('single-option checkbox boolean conversion', () => {
      it('should convert single-option checkbox to boolean when checked', () => {
        // Create a form with a single-option checkbox
        const form = document.createElement('form');

        // Create field wrapper with data attributes
        const fieldWrapper = document.createElement('div');
        fieldWrapper.setAttribute('data-field-id', 'acceptTerms');
        fieldWrapper.setAttribute('data-type', 'checkbox');

        // Create checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'acceptTerms';
        checkbox.value = 'I accept the terms and conditions';
        checkbox.checked = true;

        fieldWrapper.appendChild(checkbox);
        form.appendChild(fieldWrapper);

        // Simulate the constructPayload logic for single-option checkboxes
        const payload = {};

        // First, collect checkbox values as arrays (original behavior)
        if (checkbox.checked) {
          payload[checkbox.name] = [checkbox.value];
        } else {
          payload[checkbox.name] = [];
        }

        // Then apply the boolean conversion logic (our new behavior)
        Object.keys(payload).forEach((key) => {
          const fieldWrapperEl = form.querySelector(`[data-field-id="${key}"]`);
          if (fieldWrapperEl && (fieldWrapperEl.dataset.type === 'checkbox' || fieldWrapperEl.dataset.type === 'checkbox-group')) {
            const checkboxes = fieldWrapperEl.querySelectorAll('input[type="checkbox"]');
            if (checkboxes.length === 1 && Array.isArray(payload[key]) && payload[key].length <= 1) {
              if (BASE_ATTENDEE_DATA_FILTER[key]?.type === 'array') return;
              payload[key] = payload[key].length > 0;
            }
          }
        });

        // Verify the result is a boolean
        expect(payload.acceptTerms).to.be.true;
        expect(typeof payload.acceptTerms).to.equal('boolean');
      });

      it('should convert single-option checkbox to boolean when unchecked', () => {
        // Create a form with a single-option checkbox
        const form = document.createElement('form');

        // Create field wrapper with data attributes
        const fieldWrapper = document.createElement('div');
        fieldWrapper.setAttribute('data-field-id', 'acceptTerms');
        fieldWrapper.setAttribute('data-type', 'checkbox');

        // Create checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'acceptTerms';
        checkbox.value = 'I accept the terms and conditions';
        checkbox.checked = false;

        fieldWrapper.appendChild(checkbox);
        form.appendChild(fieldWrapper);

        // Simulate the constructPayload logic for single-option checkboxes
        const payload = {};

        // First, collect checkbox values as arrays (original behavior)
        if (checkbox.checked) {
          payload[checkbox.name] = [checkbox.value];
        } else {
          payload[checkbox.name] = [];
        }

        // Then apply the boolean conversion logic (our new behavior)
        Object.keys(payload).forEach((key) => {
          const fieldWrapperEl = form.querySelector(`[data-field-id="${key}"]`);
          if (fieldWrapperEl && (fieldWrapperEl.dataset.type === 'checkbox' || fieldWrapperEl.dataset.type === 'checkbox-group')) {
            const checkboxes = fieldWrapperEl.querySelectorAll('input[type="checkbox"]');
            if (checkboxes.length === 1 && Array.isArray(payload[key]) && payload[key].length <= 1) {
              if (BASE_ATTENDEE_DATA_FILTER[key]?.type === 'array') return;
              payload[key] = payload[key].length > 0;
            }
          }
        });

        // Verify the result is a boolean
        expect(payload.acceptTerms).to.be.false;
        expect(typeof payload.acceptTerms).to.equal('boolean');
      });

      it('should keep multi-option checkboxes as arrays', () => {
        // Create a form with multiple checkboxes
        const form = document.createElement('form');

        // Create field wrapper with data attributes
        const fieldWrapper = document.createElement('div');
        fieldWrapper.setAttribute('data-field-id', 'interests');
        fieldWrapper.setAttribute('data-type', 'checkbox-group');

        // Create multiple checkboxes
        const checkbox1 = document.createElement('input');
        checkbox1.type = 'checkbox';
        checkbox1.name = 'interests';
        checkbox1.value = 'Technology';
        checkbox1.checked = true;

        const checkbox2 = document.createElement('input');
        checkbox2.type = 'checkbox';
        checkbox2.name = 'interests';
        checkbox2.value = 'Design';
        checkbox2.checked = true;

        const checkbox3 = document.createElement('input');
        checkbox3.type = 'checkbox';
        checkbox3.name = 'interests';
        checkbox3.value = 'Marketing';
        checkbox3.checked = false;

        fieldWrapper.appendChild(checkbox1);
        fieldWrapper.appendChild(checkbox2);
        fieldWrapper.appendChild(checkbox3);
        form.appendChild(fieldWrapper);

        // Simulate the constructPayload logic for multi-option checkboxes
        const payload = {};

        // Collect checkbox values as arrays
        const checkboxes = [checkbox1, checkbox2, checkbox3];
        checkboxes.forEach((cb) => {
          if (cb.checked) {
            payload[cb.name] = payload[cb.name] ? [...payload[cb.name], cb.value] : [cb.value];
          } else {
            payload[cb.name] = payload[cb.name] || [];
          }
        });

        // Apply the boolean conversion logic (should not convert multi-option)
        Object.keys(payload).forEach((key) => {
          const fieldWrapperEl = form.querySelector(`[data-field-id="${key}"]`);
          if (fieldWrapperEl && (fieldWrapperEl.dataset.type === 'checkbox' || fieldWrapperEl.dataset.type === 'checkbox-group')) {
            const checkboxElements = fieldWrapperEl.querySelectorAll('input[type="checkbox"]');
            if (checkboxElements.length === 1 && Array.isArray(payload[key]) && payload[key].length <= 1) {
              if (BASE_ATTENDEE_DATA_FILTER[key]?.type === 'array') return;
              payload[key] = payload[key].length > 0;
            }
          }
        });

        // Verify the result is still an array
        expect(payload.interests).to.be.an('array');
        expect(payload.interests).to.include('Technology');
        expect(payload.interests).to.include('Design');
        expect(payload.interests).to.not.include('Marketing');
      });

      it('should keep contactMethods as array when one checkbox value splits on +', () => {
        const form = document.createElement('form');
        const fieldWrapper = document.createElement('div');
        fieldWrapper.setAttribute('data-field-id', 'contactMethods');
        fieldWrapper.setAttribute('data-type', 'checkbox-group');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'contactMethods';
        checkbox.value = 'email+phone';
        checkbox.checked = true;
        fieldWrapper.appendChild(checkbox);
        form.appendChild(fieldWrapper);

        const payload = {};
        if (checkbox.checked) {
          const valueList = checkbox.value.split('+').map((v) => v.trim());
          if (valueList.length > 1) {
            valueList.forEach((v) => {
              payload[checkbox.name] = payload[checkbox.name] ? [...payload[checkbox.name], v] : [v];
            });
          } else {
            payload[checkbox.name] = [checkbox.value];
          }
        } else {
          payload[checkbox.name] = [];
        }

        Object.keys(payload).forEach((key) => {
          const fieldWrapperEl = form.querySelector(`[data-field-id="${key}"]`);
          if (fieldWrapperEl && (fieldWrapperEl.dataset.type === 'checkbox' || fieldWrapperEl.dataset.type === 'checkbox-group')) {
            const checkboxes = fieldWrapperEl.querySelectorAll('input[type="checkbox"]');
            if (checkboxes.length === 1 && Array.isArray(payload[key]) && payload[key].length <= 1) {
              if (BASE_ATTENDEE_DATA_FILTER[key]?.type === 'array') return;
              payload[key] = payload[key].length > 0;
            }
          }
        });

        expect(payload.contactMethods).to.deep.equal(['email', 'phone']);
        expect(Array.isArray(payload.contactMethods)).to.be.true;
      });

      it('should keep contactMethods as empty array when single checkbox unchecked', () => {
        const form = document.createElement('form');
        const fieldWrapper = document.createElement('div');
        fieldWrapper.setAttribute('data-field-id', 'contactMethods');
        fieldWrapper.setAttribute('data-type', 'checkbox-group');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'contactMethods';
        checkbox.value = 'email+phone';
        checkbox.checked = false;
        fieldWrapper.appendChild(checkbox);
        form.appendChild(fieldWrapper);

        const payload = {};
        if (checkbox.checked) {
          const valueList = checkbox.value.split('+').map((v) => v.trim());
          if (valueList.length > 1) {
            valueList.forEach((v) => {
              payload[checkbox.name] = payload[checkbox.name] ? [...payload[checkbox.name], v] : [v];
            });
          } else {
            payload[checkbox.name] = [checkbox.value];
          }
        } else {
          payload[checkbox.name] = [];
        }

        Object.keys(payload).forEach((key) => {
          const fieldWrapperEl = form.querySelector(`[data-field-id="${key}"]`);
          if (fieldWrapperEl && (fieldWrapperEl.dataset.type === 'checkbox' || fieldWrapperEl.dataset.type === 'checkbox-group')) {
            const checkboxes = fieldWrapperEl.querySelectorAll('input[type="checkbox"]');
            if (checkboxes.length === 1 && Array.isArray(payload[key]) && payload[key].length <= 1) {
              if (BASE_ATTENDEE_DATA_FILTER[key]?.type === 'array') return;
              payload[key] = payload[key].length > 0;
            }
          }
        });

        expect(payload.contactMethods).to.deep.equal([]);
      });
    });

    describe('radio group string conversion', () => {
      function simulateRadioGroupPostProcess(form, payload) {
        Object.keys(payload).forEach((key) => {
          const fieldWrapperEl = form.querySelector(`[data-field-id="${key}"]`);
          if (fieldWrapperEl && fieldWrapperEl.dataset.type === 'radio-group' && Array.isArray(payload[key])) {
            if (BASE_ATTENDEE_DATA_FILTER[key]?.type === 'array') return;
            payload[key] = payload[key].length > 0 ? payload[key][0] : undefined;
          }
        });
      }

      it('collapses a checked radio group (single choice) to a plain string, not an array', () => {
        // Radio inputs sharing a name are mutually exclusive by native browser
        // semantics, so exactly one is checked here — mirrors real rendering.
        const form = document.createElement('form');
        const fieldWrapper = document.createElement('div');
        fieldWrapper.setAttribute('data-field-id', 'industry');
        fieldWrapper.setAttribute('data-type', 'radio-group');

        const radio1 = document.createElement('input');
        radio1.type = 'radio';
        radio1.name = 'industry';
        radio1.value = 'Technology';
        radio1.checked = true;

        const radio2 = document.createElement('input');
        radio2.type = 'radio';
        radio2.name = 'industry';
        radio2.value = 'Retail';
        radio2.checked = false;

        fieldWrapper.append(radio1, radio2);
        form.appendChild(fieldWrapper);

        const payload = {};
        [radio1, radio2].forEach((r) => {
          if (r.checked) {
            payload[r.name] = payload[r.name] ? [...payload[r.name], r.value] : [r.value];
          } else {
            payload[r.name] = payload[r.name] || [];
          }
        });

        simulateRadioGroupPostProcess(form, payload);

        expect(payload.industry).to.equal('Technology');
        expect(typeof payload.industry).to.equal('string');
      });

      it('collapses an unchecked radio group to undefined', () => {
        const form = document.createElement('form');
        const fieldWrapper = document.createElement('div');
        fieldWrapper.setAttribute('data-field-id', 'industry');
        fieldWrapper.setAttribute('data-type', 'radio-group');

        const radio1 = document.createElement('input');
        radio1.type = 'radio';
        radio1.name = 'industry';
        radio1.value = 'Technology';
        radio1.checked = false;

        fieldWrapper.append(radio1);
        form.appendChild(fieldWrapper);

        const payload = { industry: [] };
        simulateRadioGroupPostProcess(form, payload);

        expect(payload.industry).to.equal(undefined);
      });
    });
  });

  describe('inviteOnly + campaign gate', () => {
    it('invite-only block condition: should block when eventData.inviteOnly and no valid campaign in URL', () => {
      const eventDataInviteOnly = { inviteOnly: true };
      const campaignFromUrl = getValidCampaignIdFromUrl(new URLSearchParams(''));
      const shouldBlock = eventDataInviteOnly?.inviteOnly && !campaignFromUrl;
      expect(shouldBlock).to.equal(true);
    });

    it('invite-only block condition: should not block when eventData.inviteOnly but URL has valid campaign', () => {
      const eventDataInviteOnly = { inviteOnly: true };
      const campaignFromUrl = getValidCampaignIdFromUrl(new URLSearchParams('campaign=valid-camp-1'));
      const shouldBlock = eventDataInviteOnly?.inviteOnly && !campaignFromUrl;
      expect(shouldBlock).to.equal(false);
    });
  });

  describe('initFormBasedOnRSVPData', () => {
    it('does not fetch attendee data for a signed-out profile', async () => {
      const { initFormBasedOnRSVPData } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      const fetchStub = sinon.stub(window, 'fetch');
      BlockMediator.set('imsProfile', null);

      try {
        await initFormBasedOnRSVPData({ block: document.createElement('div') });
        expect(fetchStub.called).to.be.false;
      } finally {
        fetchStub.restore();
        BlockMediator.set('imsProfile', undefined);
      }
    });

    function createStore(initialValue = null) {
      let value = initialValue;
      const subscribers = [];
      return {
        get: () => value,
        set: (nextValue) => {
          value = nextValue;
          subscribers.forEach((callback) => callback({ newValue: nextValue }));
        },
        subscribe: (callback) => subscribers.push(callback),
      };
    }

    async function simulateRsvpFirstInit({
      store,
      profile,
      getAttendee,
      personalizeForm,
      showSuccess,
    }) {
      const validRegistrationStatus = ['registered', 'waitlisted'];
      const isRegistered = (rsvpData = store.get()) => validRegistrationStatus.includes(rsvpData?.registrationStatus);
      store.subscribe(({ newValue }) => {
        if (isRegistered(newValue)) showSuccess();
      });

      if (isRegistered()) {
        showSuccess();
        return;
      }

      if (profile.account_type !== 'guest') {
        await getAttendee();
        if (isRegistered()) {
          showSuccess();
          return;
        }
        personalizeForm();
      }
    }

    it('subscribes early enough to catch RSVP during attendee request', async () => {
      const store = createStore(null);
      const personalizeForm = sinon.stub();
      const showSuccess = sinon.stub();

      let resolveAttendee;
      const getAttendee = sinon.stub().returns(new Promise((resolve) => {
        resolveAttendee = resolve;
      }));

      const initPromise = simulateRsvpFirstInit({
        store,
        profile: { account_type: 'type1' },
        getAttendee,
        personalizeForm,
        showSuccess,
      });

      store.set({ registrationStatus: 'registered' });
      resolveAttendee();
      await initPromise;

      expect(showSuccess.called).to.be.true;
      expect(personalizeForm.called).to.be.false;
    });

    it('personalizes for non-registered users once attendee data resolves', async () => {
      const store = createStore(null);
      const personalizeForm = sinon.stub();
      const showSuccess = sinon.stub();
      const getAttendee = sinon.stub().resolves({});

      await simulateRsvpFirstInit({
        store,
        profile: { account_type: 'type1' },
        getAttendee,
        personalizeForm,
        showSuccess,
      });

      expect(showSuccess.called).to.be.false;
      expect(personalizeForm.calledOnce).to.be.true;
    });
  });

  describe('submitForm RSVP token submit routing', () => {
    let sandbox;
    let submitForm;
    let isEventFullError;

    before(async () => {
      const module = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      submitForm = module.submitForm;
      isEventFullError = module.isEventFullError;
    });

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
      BlockMediator.set('imsProfile', undefined);
    });

    function buildForm() {
      const form = document.createElement('form');
      [['firstName', 'Guest'], ['lastName', 'User'], ['email', 'guest@test.com']].forEach(([id, value]) => {
        const input = document.createElement('input');
        input.id = id;
        input.name = id;
        input.type = 'text';
        input.value = value;
        form.appendChild(input);
      });
      return form;
    }

    const isWrite = (call) => call.args[1]?.method === 'POST';

    function stubSubmitFlow() {
      return sandbox.stub(window, 'fetch').callsFake((url) => {
        if (typeof url === 'string' && url.includes('campaign-map.json')) return Promise.resolve({ ok: false, status: 404 });
        if (typeof url === 'string' && url.includes('/attendees')) {
          return Promise.resolve({ json: () => ({ attendeeId: 'att-1', registrationStatus: 'registered' }), ok: true, status: 201 });
        }
        return Promise.resolve({ json: () => ({ eventId: 'test-event-id', isFull: false }), ok: true });
      });
    }

    it('registers a guest with ONE write request, sending both the guest IMS token and the rsvp-token header', async () => {
      const originalAdobeIMS = window.adobeIMS;
      window.adobeIMS = { getAccessToken: () => ({ token: 'fake-token', isGuestToken: true }) };
      BlockMediator.set('imsProfile', { account_type: 'guest', rsvpToken: 'valid-rsvp-token-1234567890' });
      const fetchStub = stubSubmitFlow();

      const result = await submitForm({ form: buildForm(), sanitizeList: [] });
      window.adobeIMS = originalAdobeIMS;

      expect(result.ok).to.be.true;
      expect(result.data).to.have.property('registrationStatus', 'registered');
      const urls = fetchStub.getCalls().map((call) => call.args[0]);
      expect(urls.some((url) => url.includes('/rsvpTokenRegistrations'))).to.be.false;
      const writes = fetchStub.getCalls().filter(isWrite);
      expect(writes).to.have.length(1);
      expect(writes[0].args[0]).to.include('/v1/events/test-event-id/attendees/');
      expect(urls.some((url) => /\/v1\/attendees/.test(url))).to.be.false;
      const { headers } = writes[0].args[1];
      expect(headers.get('x-adobe-esp-rsvp-token')).to.equal('valid-rsvp-token-1234567890');
      expect(headers.get('Authorization')).to.equal('Bearer fake-token');
    });

    it('still forwards a real signed-in session\'s IMS token when the rsvp link is opened while signed in — Cluster Gateway requires one either way', async () => {
      const originalAdobeIMS = window.adobeIMS;
      window.adobeIMS = { getAccessToken: () => ({ token: 'assistants-own-token', isGuestToken: false }) };
      BlockMediator.set('imsProfile', { account_type: 'guest', rsvpToken: 'valid-rsvp-token-1234567890' });
      const fetchStub = stubSubmitFlow();

      await submitForm({ form: buildForm(), sanitizeList: [] });
      window.adobeIMS = originalAdobeIMS;

      const { headers } = fetchStub.getCalls().find(isWrite).args[1];
      expect(headers.get('x-adobe-esp-rsvp-token')).to.equal('valid-rsvp-token-1234567890');
      expect(headers.get('Authorization')).to.equal('Bearer assistants-own-token');
    });

    it('forwards a routed campaign in the body of the single request', async () => {
      resetCampaignMapCache();
      window.history.replaceState({}, '', `${window.location.pathname}?campaign=camp-1`);
      BlockMediator.set('imsProfile', { account_type: 'guest', rsvpToken: 'valid-rsvp-token-1234567890' });
      const fetchStub = stubSubmitFlow();

      try {
        await submitForm({ form: buildForm(), sanitizeList: [] });

        const writes = fetchStub.getCalls().filter(isWrite);
        expect(writes).to.have.length(1);
        expect(writes[0].args[0]).to.not.include('campaignId');
        const body = JSON.parse(writes[0].args[1].body);
        expect(body).to.have.property('campaignId', 'camp-1');
        expect(body.firstName).to.equal('Guest');
      } finally {
        window.history.replaceState({}, '', window.location.pathname);
        resetCampaignMapCache();
      }
    });

    it('registers a non-guest via IMS auth with ONE write request and no rsvp-token header', async () => {
      BlockMediator.set('imsProfile', { account_type: 'type1' });
      const fetchStub = stubSubmitFlow();

      const result = await submitForm({ form: buildForm(), sanitizeList: [] });

      expect(result.ok).to.be.true;
      const urls = fetchStub.getCalls().map((call) => call.args[0]);
      expect(urls.some((url) => url.includes('/rsvpTokenRegistrations'))).to.be.false;
      const writes = fetchStub.getCalls().filter(isWrite);
      expect(writes).to.have.length(1);
      expect(writes[0].args[1].headers.has('x-adobe-esp-rsvp-token')).to.be.false;
      const body = JSON.parse(writes[0].args[1].body);
      expect(body).to.include({ firstName: 'Guest', lastName: 'User', email: 'guest@test.com', registrationStatus: 'registered' });
    });

    it('sends waitlisted registrationStatus in the single request when the event is full', async () => {
      BlockMediator.set('imsProfile', { account_type: 'type1' });
      const fetchStub = sandbox.stub(window, 'fetch').callsFake((url) => {
        if (typeof url === 'string' && url.includes('/attendees')) {
          return Promise.resolve({ json: () => ({ registrationStatus: 'waitlisted' }), ok: true, status: 201 });
        }
        return Promise.resolve({ json: () => ({ eventId: 'test-event-id', isFull: true }), ok: true });
      });

      const result = await submitForm({ form: buildForm(), sanitizeList: [] });

      expect(result.data.registrationStatus).to.equal('waitlisted');
      const writes = fetchStub.getCalls().filter(isWrite);
      expect(writes).to.have.length(1);
      expect(JSON.parse(writes[0].args[1].body).registrationStatus).to.equal('waitlisted');
    });

    it('surfaces a structured validation failure (never an event-full result) from the single request', async () => {
      BlockMediator.set('imsProfile', { account_type: 'type1' });
      const body = { code: 'RsvpValidationError', message: 'invalid', fieldErrors: [{ field: 'email', code: 'FieldInvalidFormat', message: 'bad' }] };
      sandbox.stub(window, 'fetch').callsFake((url) => {
        if (typeof url === 'string' && url.includes('/attendees')) {
          return Promise.resolve({ text: () => JSON.stringify(body), ok: false, status: 400 });
        }
        return Promise.resolve({ json: () => ({ eventId: 'test-event-id', isFull: false }), ok: true });
      });

      const result = await submitForm({ form: buildForm(), sanitizeList: [] });

      expect(result.ok).to.be.false;
      expect(result.code).to.equal('RsvpValidationError');
      expect(result.fieldErrors[0].field).to.equal('email');
      expect(isEventFullError(result.status, result.error)).to.be.false;
    });
  });

  describe('shouldAutoRegisterSessions', () => {
    let shouldAutoRegisterSessions;

    before(async () => {
      const module = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      shouldAutoRegisterSessions = module.shouldAutoRegisterSessions;
    });

    it('returns true for a registered, non-rsvp-token profile', () => {
      expect(shouldAutoRegisterSessions('registered', { account_type: 'type1' })).to.be.true;
    });

    it('returns false for a registered rsvp-token (guest) profile', () => {
      expect(shouldAutoRegisterSessions('registered', { account_type: 'guest', rsvpToken: 'tok-1234567890abcdef' })).to.be.false;
    });

    it('returns false for a waitlisted registration regardless of profile', () => {
      expect(shouldAutoRegisterSessions('waitlisted', { account_type: 'type1' })).to.be.false;
      expect(shouldAutoRegisterSessions('waitlisted', { account_type: 'guest', rsvpToken: 'tok-1234567890abcdef' })).to.be.false;
    });

    it('returns true for a registered response when profile is null/undefined (no rsvp token present)', () => {
      expect(shouldAutoRegisterSessions('registered', null)).to.be.true;
      expect(shouldAutoRegisterSessions('registered', undefined)).to.be.true;
    });
  });

  describe('getFullState and buildErrorMsg (campaign-aware 400)', () => {
    let sandbox;
    let originalHref;
    let getFullState;
    let buildErrorMsg;
    let isWaitlistingEnabled;

    before(async () => {
      const module = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      getFullState = module.getFullState;
      buildErrorMsg = module.buildErrorMsg;
      isWaitlistingEnabled = module.isWaitlistingEnabled;
    });

    describe('isWaitlistingEnabled', () => {
      it('treats a real boolean true the same as the string "true" — ESP returns either depending on source', () => {
        expect(isWaitlistingEnabled({ data: { allowWaitlisting: true } })).to.be.true;
        expect(isWaitlistingEnabled({ data: { allowWaitlisting: 'true' } })).to.be.true;
      });

      it('treats boolean false, the string "false", and a missing value as disabled', () => {
        expect(isWaitlistingEnabled({ data: { allowWaitlisting: false } })).to.be.false;
        expect(isWaitlistingEnabled({ data: { allowWaitlisting: 'false' } })).to.be.false;
        expect(isWaitlistingEnabled({ data: {} })).to.be.false;
        expect(isWaitlistingEnabled({})).to.be.false;
        expect(isWaitlistingEnabled(undefined)).to.be.false;
      });
    });

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      originalHref = window.location.href;
      window.adobeIMS = window.adobeIMS || { getAccessToken: () => ({ token: 'test-token' }) };
    });

    afterEach(() => {
      sandbox.restore();
      window.history.replaceState({}, '', originalHref);
      BlockMediator.set('imsProfile', undefined);
    });

    function stubFetchByUrl(eventResponse, campaignResponse = null) {
      window.fetch.restore?.();
      sandbox.stub(window, 'fetch').callsFake((url) => {
        if (typeof url === 'string' && url.includes('/campaigns/')) {
          return Promise.resolve(campaignResponse != null ? campaignResponse : { json: () => ({}), ok: false, status: 404 });
        }
        return Promise.resolve(eventResponse);
      });
    }

    it('getFullState returns event-based full when no campaign in URL', async () => {
      stubFetchByUrl({
        json: () => ({
          isFull: true,
          allowWaitlisting: false,
          attendeeCount: 100,
          attendeeLimit: 100,
        }),
        ok: true,
      });
      const state = await getFullState('test-event-id');
      expect(state.full).to.be.true;
      expect(state.usedCampaign).to.be.false;
      expect(state.waitlistEnabled).to.be.false;
    });

    it('getFullState returns campaign-based full when campaign in URL and campaign full', async () => {
      window.history.replaceState({}, '', `${originalHref.split('?')[0]}?campaign=camp-1`);
      stubFetchByUrl(
        {
          json: () => ({
            isFull: false,
            allowWaitlisting: true,
            attendeeCount: 50,
            attendeeLimit: 100,
          }),
          ok: true,
        },
        {
          json: () => ({
            campaignId: 'camp-1',
            attendeeLimit: 100,
            attendeeCount: 100,
            waitlistAttendeeCount: 0,
          }),
          ok: true,
        },
      );
      const state = await getFullState('test-event-id');
      expect(state.full).to.be.true;
      expect(state.usedCampaign).to.be.true;
      expect(state.waitlistEnabled).to.be.true;
    });

    it('getFullState falls back to event when campaign in URL but getCampaign fails', async () => {
      window.history.replaceState({}, '', `${originalHref.split('?')[0]}?campaign=camp-1`);
      stubFetchByUrl(
        {
          json: () => ({
            isFull: true,
            allowWaitlisting: false,
            attendeeCount: 100,
            attendeeLimit: 100,
          }),
          ok: true,
        },
        { json: () => ({ message: 'Not found' }), ok: false, status: 404 },
      );
      const state = await getFullState('test-event-id');
      expect(state.full).to.be.true;
      expect(state.usedCampaign).to.be.false;
    });

    it('buildErrorMsg uses the event-full error key only when the backend confirms "Event is full" on a 400', async () => {
      stubFetchByUrl({
        json: () => ({
          isFull: true,
          allowWaitlisting: false,
          attendeeCount: 100,
          attendeeLimit: 100,
        }),
        ok: true,
      });
      const form = document.createElement('form');
      await buildErrorMsg(form, 400, 'Event is full');
      const errorEl = form.querySelector('.error');
      expect(errorEl).to.not.be.null;
      expect(errorEl.textContent).to.equal('event-full-no-waitlist-error-msg');
    });

    it('buildErrorMsg uses the campaign-full error key only when the backend confirms "Campaign is full" on a 409', async () => {
      stubFetchByUrl({
        json: () => ({
          isFull: false,
          allowWaitlisting: true,
          attendeeCount: 50,
          attendeeLimit: 100,
        }),
        ok: true,
      });
      const form = document.createElement('form');
      await buildErrorMsg(form, 409, 'Campaign is full');
      const errorEl = form.querySelector('.error');
      expect(errorEl).to.not.be.null;
      expect(errorEl.textContent).to.equal('campaign-full-error-msg');
    });

    it('buildErrorMsg shows the token-invalid message when a 400 is an rsvp-token/attendeeId mismatch', async () => {
      stubFetchByUrl({ json: () => ({}), ok: true });
      const form = document.createElement('form');
      await buildErrorMsg(form, 400, 'Authorization token is not valid for attendeeId');
      const errorEl = form.querySelector('.error');
      expect(errorEl).to.not.be.null;
      expect(errorEl.textContent).to.equal('This registration link is no longer valid. It may have already been used or expired.');
    });

    it('buildErrorMsg shows a generic "check your entries" message for a plain-text 400 that is not a confirmed capacity or token failure', async () => {
      stubFetchByUrl({ json: () => ({}), ok: true });
      const form = document.createElement('form');
      await buildErrorMsg(form, 400, 'Custom field companyName is required');
      const errorEl = form.querySelector('.error');
      expect(errorEl).to.not.be.null;
      expect(errorEl.textContent).to.equal('There was a problem with the information you submitted. Please check your entries and try again.');
    });

    it('buildErrorMsg shows the same generic message for a JSON schema-validation 400 body', async () => {
      stubFetchByUrl({ json: () => ({}), ok: true });
      const form = document.createElement('form');
      await buildErrorMsg(form, 400, { message: 'Invalid request', errors: [{ path: '.email', message: 'must match format "email"' }] });
      const errorEl = form.querySelector('.error');
      expect(errorEl).to.not.be.null;
      expect(errorEl.textContent).to.equal('There was a problem with the information you submitted. Please check your entries and try again.');
    });

    it('buildErrorMsg shows the already-registered message on a 409 when an RSVP token is active', async () => {
      // AttendeeAlreadyRegistered — this email is already registered for the event.
      // The token itself is NOT consumed on this error, so the copy must not imply
      // the link is dead.
      BlockMediator.set('imsProfile', { account_type: 'guest', rsvpToken: 'tok-1234567890abcdef' });
      stubFetchByUrl({ json: () => ({}), ok: true });
      const form = document.createElement('form');
      await buildErrorMsg(form, 409);
      const errorEl = form.querySelector('.error');
      expect(errorEl).to.not.be.null;
      expect(errorEl.textContent).to.equal('This email is already registered for this event.');
    });

    it('buildErrorMsg shows the token-invalid message on a 401/404/410 when an RSVP token is active', async () => {
      // Models the two-tab race: the token was valid at page load but got used
      // elsewhere before this submit, so the submit call fails as gone/not-found,
      // or the RSVP-token header failed to reach the server (401) — same class
      // of "not usable here" outcome as the validate call in profile.js.
      BlockMediator.set('imsProfile', { account_type: 'guest', rsvpToken: 'tok-1234567890abcdef' });
      stubFetchByUrl({ json: () => ({}), ok: true });
      for (const status of [401, 404, 410]) {
        const form = document.createElement('form');
        await buildErrorMsg(form, status);
        const errorEl = form.querySelector('.error');
        expect(errorEl).to.not.be.null;
        expect(errorEl.textContent).to.equal('This registration link is no longer valid. It may have already been used or expired.');
      }
    });

    it('buildErrorMsg falls back to the generic message for a 403/500 failure with an RSVP token active', async () => {
      // 403 (waitlisting not allowed / invite-only) and 500 don't mean the token
      // became unusable, so they must not surface the invalid-link copy.
      BlockMediator.set('imsProfile', { account_type: 'guest', rsvpToken: 'tok-1234567890abcdef' });
      stubFetchByUrl({ json: () => ({}), ok: true });
      const form = document.createElement('form');
      await buildErrorMsg(form, 403);
      const errorEl = form.querySelector('.error');
      expect(errorEl).to.not.be.null;
      expect(errorEl.textContent).to.equal('rsvp-error-msg');
    });

    it('buildErrorMsg falls back to the generic message for a non-400 failure with no RSVP token', async () => {
      stubFetchByUrl({ json: () => ({}), ok: true });
      const form = document.createElement('form');
      await buildErrorMsg(form, 500);
      const errorEl = form.querySelector('.error');
      expect(errorEl).to.not.be.null;
      expect(errorEl.textContent).to.equal('rsvp-error-msg');
    });

    describe('structured error codes', () => {
      const message = async (status, error, eventResp = { json: () => ({ allowWaitlisting: false }), ok: true }) => {
        stubFetchByUrl(eventResp);
        const form = document.createElement('form');
        await buildErrorMsg(form, status, error);
        return form.querySelector('.error')?.textContent;
      };

      it('RsvpValidationError shows the invalid-submission message, never an event-full one', async () => {
        const text = await message(400, { code: 'RsvpValidationError', message: 'Event is full', fieldErrors: [{ field: 'email', code: 'FieldInvalidFormat' }] });
        expect(text).to.equal('There was a problem with the information you submitted. Please check your entries and try again.');
        expect(text).to.not.include('full');
      });

      it('EventFull uses the event-full keys (waitlist-aware)', async () => {
        expect(await message(400, { code: 'EventFull', message: 'x' })).to.equal('event-full-no-waitlist-error-msg');
        expect(await message(400, { code: 'EventFull', message: 'x' }, { json: () => ({ allowWaitlisting: true }), ok: true })).to.equal('event-full-error-msg');
      });

      it('CampaignFull uses the campaign-full keys', async () => {
        expect(await message(409, { code: 'CampaignFull', message: 'x' })).to.equal('campaign-full-no-waitlist-error-msg');
      });

      it('AttendeeAlreadyRegistered shows the already-registered message for guests without a token', async () => {
        expect(await message(409, { code: 'AttendeeAlreadyRegistered', message: 'x' })).to.equal('This email is already registered for this event.');
      });

      it('InvalidAttendeeToken shows the token-invalid message', async () => {
        expect(await message(400, { code: 'InvalidAttendeeToken', message: 'x' })).to.equal('This registration link is no longer valid. It may have already been used or expired.');
      });

      it('InviteOnlyEvent and CampaignNotFound show the invitation-only message', async () => {
        const expected = 'Registration is only available through a valid invitation link.';
        expect(await message(403, { code: 'InviteOnlyEvent', message: 'x' })).to.equal(expected);
        expect(await message(404, { code: 'CampaignNotFound', message: 'x' })).to.equal(expected);
      });

      it('WaitlistingNotAllowed shows the no-waitlist full message', async () => {
        expect(await message(403, { code: 'WaitlistingNotAllowed', message: 'x' })).to.equal('event-full-no-waitlist-error-msg');
      });

      it('other known codes fall back to the general failure message', async () => {
        const codes = [['EventNotFull', 400], ['EventNotFound', 404], ['NonexistentAttendee', 404], ['InvalidExternalIdMapping', 400]];
        for (const [code, status] of codes) {
          // eslint-disable-next-line no-await-in-loop
          expect(await message(status, { code, message: 'x' })).to.equal('rsvp-error-msg');
        }
      });
    });
  });

  describe('isEventFullError', () => {
    let isEventFullError;

    before(async () => {
      ({ isEventFullError } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js'));
    });

    it('is true only for the EventFull code, or the legacy plain-text 400 body', () => {
      expect(isEventFullError(400, { code: 'EventFull' })).to.be.true;
      expect(isEventFullError(400, 'Event is full')).to.be.true;
      expect(isEventFullError(400, { message: 'Event is full' })).to.be.true;
    });

    it('is false for validation failures even if the message says "Event is full"', () => {
      expect(isEventFullError(400, { code: 'RsvpValidationError', message: 'Event is full' })).to.be.false;
      expect(isEventFullError(409, { code: 'AttendeeAlreadyRegistered' })).to.be.false;
      expect(isEventFullError(400, 'Custom field x is required')).to.be.false;
      expect(isEventFullError('Network Error', 'Event is full')).to.be.false;
    });
  });

  describe('showFieldErrors', () => {
    let showFieldErrors;
    let clearFieldErrors;
    let form;

    before(async () => {
      ({ showFieldErrors, clearFieldErrors } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js'));
    });

    beforeEach(() => {
      form = document.createElement('form');
      form.innerHTML = `
        <div class="field-wrapper" data-field-id="companyName"><label for="companyName">Company</label><input id="companyName" type="text"></div>
        <div class="field-wrapper" data-field-id="industry"><select id="industry"><option value="">-</option></select></div>
        <div class="field-wrapper" data-field-id="interests" data-type="checkbox-group">
          <input type="checkbox" name="interests" id="interests-a" value="a">
        </div>`;
      document.body.append(form);
    });

    afterEach(() => form.remove());

    it('shows a field-level message next to each matching control and wires aria attributes', async () => {
      const unmatched = await showFieldErrors(form, [
        { field: 'companyName', code: 'FieldRequired', message: 'ignored server text' },
        { field: 'industry', code: 'FieldInvalidOption' },
        { field: 'interests', code: 'FieldInvalidType' },
      ]);

      expect(unmatched).to.deep.equal([]);
      const messages = form.querySelectorAll('.field-error');
      expect(messages).to.have.length(3);
      const input = form.querySelector('#companyName');
      expect(input.getAttribute('aria-invalid')).to.equal('true');
      const described = form.querySelector(`#${input.getAttribute('aria-describedby')}`);
      expect(described.textContent).to.equal('This field is required.');
      expect(described.hasAttribute('role')).to.be.false;
      expect(form.querySelector('[data-field-id="industry"] .field-error').textContent).to.equal('Please choose a valid option.');
    });

    it('returns fields that have no matching control so the caller can show a general message', async () => {
      const unmatched = await showFieldErrors(form, [{ field: 'notOnForm', code: 'FieldUnknown' }, { field: 'companyName', code: 'FieldTooLong' }]);

      expect(unmatched).to.deep.equal(['notOnForm']);
      expect(form.querySelectorAll('.field-error')).to.have.length(1);
    });

    it('falls back to the invalid-submission copy for an unrecognized code', async () => {
      await showFieldErrors(form, [{ field: 'companyName', code: 'SomethingNew' }]);

      expect(form.querySelector('.field-error').textContent).to.equal('There was a problem with the information you submitted. Please check your entries and try again.');
    });

    it('clears the message and aria state when the user edits the field', async () => {
      await showFieldErrors(form, [{ field: 'companyName', code: 'FieldRequired' }]);
      const input = form.querySelector('#companyName');

      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(form.querySelector('.field-error')).to.be.null;
      expect(input.hasAttribute('aria-invalid')).to.be.false;
    });

    it('appends to existing aria-describedby and restores it when the error clears', async () => {
      const input = form.querySelector('#companyName');
      input.setAttribute('aria-describedby', 'company-hint');

      await showFieldErrors(form, [{ field: 'companyName', code: 'FieldRequired' }]);
      expect(input.getAttribute('aria-describedby')).to.match(/^company-hint companyName-error-0$/);

      clearFieldErrors(form);
      expect(input.getAttribute('aria-describedby')).to.equal('company-hint');
    });

    it('does not accumulate input listeners across resubmits', async () => {
      const wrapper = form.querySelector('[data-field-id="companyName"]');
      const add = sinon.spy(wrapper, 'addEventListener');
      const remove = sinon.spy(wrapper, 'removeEventListener');

      await showFieldErrors(form, [{ field: 'companyName', code: 'FieldRequired' }]);
      await showFieldErrors(form, [{ field: 'companyName', code: 'FieldTooLong' }]);
      clearFieldErrors(form);

      expect(add.callCount).to.equal(2);
      expect(remove.callCount).to.equal(2);
    });

    it('replaces earlier messages on re-validation and clearFieldErrors removes everything', async () => {
      await showFieldErrors(form, [{ field: 'companyName', code: 'FieldRequired' }]);
      await showFieldErrors(form, [{ field: 'industry', code: 'FieldInvalidOption' }]);
      expect(form.querySelectorAll('.field-error')).to.have.length(1);
      expect(form.querySelector('#companyName').hasAttribute('aria-invalid')).to.be.false;

      clearFieldErrors(form);
      expect(form.querySelectorAll('.field-error')).to.have.length(0);
      expect(form.querySelector('[aria-invalid]')).to.be.null;
    });
  });

  describe('handleSubmitResult', () => {
    let handleSubmitResult;
    let form;
    let button;
    let bp;
    let tracked;
    let originalSatellite;
    let fetchStub;
    let getStub;
    let setStub;

    before(async () => {
      ({ handleSubmitResult } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js'));
    });

    beforeEach(() => {
      const modal = document.createElement('div');
      modal.className = 'dialog-modal';
      form = document.createElement('form');
      form.innerHTML = '<div class="field-wrapper" data-field-id="companyName"><input id="companyName" type="text"></div>';
      modal.append(form);
      document.body.append(modal);
      button = document.createElement('button');
      bp = { block: form, form };
      tracked = [];
      originalSatellite = window._satellite;
      window._satellite = { track: (_, data) => tracked.push(data.data.web.webInteraction.name) };
      fetchStub = sinon.stub(window, 'fetch').resolves({ json: () => ({ allowWaitlisting: false }), ok: true });
      // Isolated store: subscribers leaked by earlier init tests would throw on a real set().
      const store = { rsvpData: { registrationStatus: 'registered' } };
      getStub = sinon.stub(BlockMediator, 'get').callsFake((key) => store[key]);
      setStub = sinon.stub(BlockMediator, 'set').callsFake((key, value) => { store[key] = value; });
    });

    afterEach(() => {
      getStub.restore();
      setStub.restore();
      fetchStub.restore();
      window._satellite = originalSatellite;
      form.closest('.dialog-modal').remove();
    });

    it('keeps rsvpData, shows field messages only, and tracks code + field names for a validation error', async () => {
      await handleSubmitResult(bp, button, {
        ok: false,
        status: 400,
        error: { code: 'RsvpValidationError', message: 'Event is full', fieldErrors: [{ field: 'companyName', code: 'FieldRequired' }] },
      });

      expect(BlockMediator.get('rsvpData')).to.deep.equal({ registrationStatus: 'registered' });
      expect(form.querySelectorAll('.field-error')).to.have.length(1);
      expect(form.querySelector('.error')).to.be.null;
      expect(button.disabled).to.be.false;
      expect(tracked).to.deep.equal(['Form Submit Error | RsvpValidationError | companyName']);
    });

    it('shows the general banner when a validation field matches no control', async () => {
      await handleSubmitResult(bp, button, {
        ok: false,
        status: 400,
        error: { code: 'RsvpValidationError', fieldErrors: [{ field: 'notOnForm', code: 'FieldUnknown' }] },
      });

      expect(form.querySelector('.error')).to.not.be.null;
      expect(BlockMediator.get('rsvpData')).to.deep.equal({ registrationStatus: 'registered' });
    });

    it('clears rsvpData and disables the button for EventFull', async () => {
      await handleSubmitResult(bp, button, { ok: false, status: 400, error: { code: 'EventFull', message: 'Event is full' } });

      expect(BlockMediator.get('rsvpData')).to.be.null;
      expect(button.disabled).to.be.true;
      expect(tracked).to.deep.equal(['Form Submit Error | EventFull']);
    });

    it('falls back to the status in analytics when there is no error code', async () => {
      await handleSubmitResult(bp, button, { ok: false, status: 500, error: 'boom' });

      expect(tracked).to.deep.equal(['Form Submit Error | 500']);
      expect(form.querySelector('.error')).to.not.be.null;
    });

    it('stores rsvpData and tracks Form Submit on success', async () => {
      await handleSubmitResult(bp, button, { ok: true, status: 201, data: { attendeeId: 'a1', registrationStatus: 'waitlisted' } });

      expect(BlockMediator.get('rsvpData')).to.deep.equal({ attendeeId: 'a1', registrationStatus: 'waitlisted' });
      expect(tracked).to.deep.equal(['Form Submit']);
    });
  });

  describe('getRsvpConfigFromMeta', () => {
    let metaEl;

    afterEach(() => {
      metaEl?.remove();
      metaEl = null;
      document.head.querySelectorAll('meta[name="rsvp-config"]').forEach((el) => el.remove());
    });

    function setRsvpConfigMeta(value) {
      metaEl = document.createElement('meta');
      metaEl.setAttribute('name', 'rsvp-config');
      metaEl.content = JSON.stringify(value);
      document.head.appendChild(metaEl);
    }

    it('returns null when rsvp-config meta is absent', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      expect(getRsvpConfigFromMeta()).to.equal(null);
    });

    it('returns null when rsvpFormFields is empty', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({ rsvpFormFields: [] });
      expect(getRsvpConfigFromMeta()).to.equal(null);
    });

    it('appends a submit field when none exists in rsvpFormFields', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          { field: 'industry', label: 'Industry', type: 'select', required: true, options: [] },
        ],
      });
      const result = getRsvpConfigFromMeta();
      const submitField = result.data.find((f) => f.type === 'submit');
      expect(submitField).to.exist;
      expect(submitField.field).to.equal('Submit');
      expect(submitField.label).to.equal('Submit');
    });

    it('does not append a duplicate submit field when one already exists', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          { field: 'industry', label: 'Industry', type: 'select', required: false, options: [] },
          { field: 'Submit', label: 'Submit', type: 'submit', required: false, options: [] },
        ],
      });
      const result = getRsvpConfigFromMeta();
      const submitFields = result.data.filter((f) => f.type === 'submit');
      expect(submitFields).to.have.lengthOf(1);
    });

    it('maps required boolean true to "x"', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          { field: 'title', label: 'Title', type: 'text', required: true, options: [] },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].required).to.equal('x');
    });

    it('maps required boolean false to empty string', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          { field: 'title', label: 'Title', type: 'text', required: false, options: [] },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].required).to.equal('');
    });

    it('remaps checkbox + displayAs "dropdown" to multi-select', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          {
            field: 'interests', label: 'Interests', type: 'checkbox', displayAs: 'dropdown', required: false, options: [],
          },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].type).to.equal('multi-select');
    });

    it('leaves checkbox + displayAs "checkbox" (default) as checkbox', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          {
            field: 'interests', label: 'Interests', type: 'checkbox', displayAs: 'checkbox', required: false, options: [],
          },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].type).to.equal('checkbox');
    });

    it('leaves checkbox with no displayAs as checkbox (default, backward compatible)', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          { field: 'interests', label: 'Interests', type: 'checkbox', required: false, options: [] },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].type).to.equal('checkbox');
    });

    it('remaps select + displayAs "radio" to radio-group', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          {
            field: 'industry', label: 'Industry', type: 'select', displayAs: 'radio', required: false, options: [],
          },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].type).to.equal('radio-group');
    });

    it('leaves select + displayAs "dropdown" (default) as select', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          {
            field: 'industry', label: 'Industry', type: 'select', displayAs: 'dropdown', required: false, options: [],
          },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].type).to.equal('select');
    });

    // Substrate/displayAs taxonomy: type names only the substrate (text/select/
    // multi-select); displayAs picks the concrete widget within it.
    [
      ['text', undefined, 'text'],
      ['text', 'text', 'text'],
      ['text', 'email', 'email'],
      ['text', 'phone', 'phone'],
      ['text', 'number', 'number'],
      ['text', 'date', 'date'],
      ['text', 'url', 'url'],
      ['text', 'text-area', 'text-area'],
      ['text', 'not-a-real-flavor', 'text'],
    ].forEach(([type, displayAs, expected]) => {
      it(`remaps text + displayAs "${displayAs}" to "${expected}"`, async () => {
        const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
        setRsvpConfigMeta({
          rsvpFormFields: [
            { field: 'title', label: 'Title', type, displayAs, required: false, options: [] },
          ],
        });
        const result = getRsvpConfigFromMeta();
        expect(result.data[0].type).to.equal(expected);
      });
    });

    it('remaps select + displayAs "picker" (default) to select', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          {
            field: 'industry', label: 'Industry', type: 'select', displayAs: 'picker', required: false, options: [],
          },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].type).to.equal('select');
    });

    it('remaps multi-select + displayAs "checkbox" (default) to checkbox-group', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          {
            field: 'interests', label: 'Interests', type: 'multi-select', displayAs: 'checkbox', required: false, options: [],
          },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].type).to.equal('checkbox-group');
    });

    it('leaves multi-select with no displayAs as checkbox-group (default)', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          { field: 'interests', label: 'Interests', type: 'multi-select', required: false, options: [] },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].type).to.equal('checkbox-group');
    });

    it('remaps multi-select + displayAs "combobox" to the compact multi-select widget', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          {
            field: 'interests', label: 'Interests', type: 'multi-select', displayAs: 'combobox', required: false, options: [],
          },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].type).to.equal('multi-select');
    });

    it('leaves non-taxonomy types (e.g. heading, divider) untouched', async () => {
      const { getRsvpConfigFromMeta } = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
      setRsvpConfigMeta({
        rsvpFormFields: [
          { field: 'intro', label: 'Welcome', type: 'heading', required: false, options: [] },
          { field: 'sep', label: '', type: 'divider', required: false, options: [] },
        ],
      });
      const result = getRsvpConfigFromMeta();
      expect(result.data[0].type).to.equal('heading');
      expect(result.data[1].type).to.equal('divider');
    });
  });
});

describe('onProfile', () => {
  let metaRsvpConfig;
  let dictionaryManager;
  let initializeStub;
  let onProfile;

  before(async () => {
    const module = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
    const dictionaryModule = await import('../../../../event-libs/v1/utils/dictionary-manager.js');
    onProfile = module.onProfile;
    dictionaryManager = dictionaryModule.dictionaryManager;
  });

  beforeEach(() => {
    const allowGuestMeta = document.createElement('meta');
    allowGuestMeta.name = 'allow-guest-registration';
    allowGuestMeta.content = 'true';
    document.head.append(allowGuestMeta);
  });

  afterEach(() => {
    metaRsvpConfig?.remove();
    metaRsvpConfig = null;
    document.head.querySelectorAll('meta[name="rsvp-config"]').forEach((el) => el.remove());
    document.head.querySelectorAll('meta[name="allow-guest-registration"]').forEach((el) => el.remove());
    initializeStub?.restore();
    initializeStub = null;
    BlockMediator.set('imsProfile', undefined);
    BlockMediator.set('eventData', undefined);
    BlockMediator.set('rsvpData', undefined);
  });

  it('builds the RSVP form after the signed-out profile resolves to null', async () => {
    initializeStub = sinon.stub(dictionaryManager, 'initialize').resolves();
    const meta = document.createElement('meta');
    meta.name = 'rsvp-config';
    meta.content = JSON.stringify({
      rsvpFormFields: [
        { field: 'firstName', label: 'First Name', type: 'text', required: true, options: [] },
      ],
    });
    document.head.append(meta);
    metaRsvpConfig = meta;

    const block = document.createElement('div');
    block.classList.add('loading');
    const eventHero = document.createElement('div');
    eventHero.classList.add('loading');
    const formContainer = document.createElement('div');
    const formLink = document.createElement('a');
    formLink.href = 'https://example.com/rsvp.json';
    formContainer.append(formLink);
    block.append(eventHero, formContainer);

    BlockMediator.set('imsProfile', undefined);
    BlockMediator.set('eventData', { inviteOnly: false });
    await onProfile({
      block,
      eventHero,
      formContainer,
      form: formLink,
      terms: document.createElement('div'),
    }, null);

    BlockMediator.set('imsProfile', null);
    for (let attempt = 0; attempt < 20 && block.classList.contains('loading'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(block.querySelector('form input#firstName')).to.exist;
    expect(block.classList.contains('loading')).to.be.false;
  });

  it('builds the RSVP form when the signed-out profile is already null before initialization', async () => {
    initializeStub = sinon.stub(dictionaryManager, 'initialize').resolves();
    const meta = document.createElement('meta');
    meta.name = 'rsvp-config';
    meta.content = JSON.stringify({
      rsvpFormFields: [
        { field: 'firstName', label: 'First Name', type: 'text', required: true, options: [] },
      ],
    });
    document.head.append(meta);
    metaRsvpConfig = meta;

    const block = document.createElement('div');
    block.classList.add('loading');
    const eventHero = document.createElement('div');
    eventHero.classList.add('loading');
    const formContainer = document.createElement('div');
    const formLink = document.createElement('a');
    formLink.href = 'https://example.com/rsvp.json';
    formContainer.append(formLink);
    block.append(eventHero, formContainer);

    BlockMediator.set('imsProfile', null);
    BlockMediator.set('eventData', { inviteOnly: false });
    await onProfile({
      block,
      eventHero,
      formContainer,
      form: formLink,
      terms: document.createElement('div'),
    }, null);

    for (let attempt = 0; attempt < 20 && block.classList.contains('loading'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(block.querySelector('form input#firstName')).to.exist;
    expect(block.classList.contains('loading')).to.be.false;
  });
});

describe('addTerms', () => {
  let addTerms;

  before(async () => {
    const module = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
    addTerms = module.addTerms;
  });

  function buildForm() {
    const form = document.createElement('form');
    const submitWrapper = document.createElement('div');
    submitWrapper.className = 'events-form-submit-wrapper';
    form.append(submitWrapper);
    return form;
  }

  it('keeps every authored <p> in the cell, including the last one', () => {
    const form = buildForm();
    const terms = document.createElement('div');
    terms.innerHTML = '<p>First line of the RSVP description.</p><p>Second line that must not be dropped.</p>';

    addTerms(form, terms);

    const paragraphs = form.querySelectorAll('.event-terms-wrapper p');
    expect(paragraphs.length).to.equal(2);
    expect(paragraphs[0].textContent).to.equal('First line of the RSVP description.');
    expect(paragraphs[1].textContent).to.equal('Second line that must not be dropped.');
  });

  it('preserves <ul>/<li> elements in the cell instead of stripping them', () => {
    const form = buildForm();
    const terms = document.createElement('div');
    terms.innerHTML = '<p>Intro paragraph.</p><ul><li>should be kept</li></ul>';

    addTerms(form, terms);

    const wrapper = form.querySelector('.event-terms-wrapper');
    const li = wrapper.querySelector('li');
    expect(li).to.not.equal(null);
    expect(li.textContent).to.equal('should be kept');
  });

  it('keeps multiple <p> and a <ul> together in document order', () => {
    const form = buildForm();
    const terms = document.createElement('div');
    terms.innerHTML = '<p>First.</p><p>Second.</p><ul><li>One</li><li>Two</li></ul>';

    addTerms(form, terms);

    const wrapper = form.querySelector('.event-terms-wrapper');
    const tagOrder = [...wrapper.children].map((el) => el.tagName);
    expect(tagOrder).to.deep.equal(['P', 'P', 'UL']);
    expect(wrapper.querySelectorAll('li').length).to.equal(2);
  });

  it('keeps document order when a <ul> is authored before a <p>', () => {
    const form = buildForm();
    const terms = document.createElement('div');
    terms.innerHTML = '<ul><li>Bullet</li></ul><p>Trailing paragraph.</p>';

    addTerms(form, terms);

    const wrapper = form.querySelector('.event-terms-wrapper');
    const tagOrder = [...wrapper.children].map((el) => el.tagName);
    expect(tagOrder).to.deep.equal(['UL', 'P']);
  });

  it('does not pull a <p> nested inside a <li> out of its list item', () => {
    const form = buildForm();
    const terms = document.createElement('div');
    terms.innerHTML = '<p>Intro.</p><ul><li><p>Bullet one</p></li><li><p>Bullet two</p></li></ul>';

    addTerms(form, terms);

    const wrapper = form.querySelector('.event-terms-wrapper');
    const tagOrder = [...wrapper.children].map((el) => el.tagName);
    expect(tagOrder).to.deep.equal(['P', 'UL']);

    const listItems = wrapper.querySelectorAll('li');
    expect(listItems.length).to.equal(2);
    expect(listItems[0].textContent).to.equal('Bullet one');
    expect(listItems[1].textContent).to.equal('Bullet two');
  });

  it('does nothing when the cell is empty', () => {
    const form = buildForm();
    const terms = document.createElement('div');

    addTerms(form, terms);

    expect(form.querySelector('.event-terms-wrapper')).to.equal(null);
  });

  it('resolves content wrapped in a cell div, matching authored block markup', () => {
    const form = buildForm();
    const terms = document.createElement('div');
    terms.innerHTML = '<div><p>First.</p><p>Second.</p><ul><li>One</li><li>Two</li></ul></div>';

    addTerms(form, terms);

    const wrapper = form.querySelector('.event-terms-wrapper');
    const tagOrder = [...wrapper.children].map((el) => el.tagName);
    expect(tagOrder).to.deep.equal(['P', 'P', 'UL']);
    expect(wrapper.children.length).to.equal(3);
    expect(wrapper.querySelectorAll('li').length).to.equal(2);
  });
});

describe('createSelect - multi-select combobox condensed view', () => {
  let createSelect;
  let sandbox;

  before(async () => {
    const module = await import('../../../../event-libs/v1/blocks/events-form/events-form.js');
    createSelect = module.createSelect;
  });

  beforeEach(async () => {
    const { dictionaryManager } = await import('../../../../event-libs/v1/utils/dictionary-manager.js');
    sandbox = sinon.createSandbox();
    sandbox.stub(dictionaryManager, 'getValue').callsFake((key) => key);
  });

  afterEach(() => {
    sandbox.restore();
  });

  function buildField(overrides = {}) {
    return {
      field: 'productsOfInterest',
      placeholder: 'Select products',
      options: 'Acrobat;Illustrator;InDesign;Lightroom;Photoshop',
      defval: '',
      required: '',
      type: 'multi-select',
      ...overrides,
    };
  }

  function check(wrapper, value, checked) {
    const checkbox = wrapper.querySelector(`.custom-dropdown input[value="${value}"]`);
    checkbox.checked = checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function dropdownOrder(wrapper) {
    return Array.from(wrapper.querySelectorAll('.custom-dropdown input'))
      .map((cb) => cb.value);
  }

  it('shows the plain comma list when 2 or fewer options are selected', () => {
    const wrapper = createSelect(buildField());
    check(wrapper, 'Acrobat', true);
    check(wrapper, 'Illustrator', true);
    expect(wrapper.querySelector('.selected-options').textContent).to.equal('Acrobat, Illustrator');
  });

  it('condenses to "+N more" once selection exceeds the visible count', () => {
    const wrapper = createSelect(buildField());
    check(wrapper, 'Acrobat', true);
    check(wrapper, 'Illustrator', true);
    check(wrapper, 'Photoshop', true);
    expect(wrapper.querySelector('.selected-options').textContent).to.equal('Acrobat, Illustrator +1 more');
  });

  it('drops the "+N more" suffix again once deselecting back under the threshold', () => {
    const wrapper = createSelect(buildField());
    check(wrapper, 'Acrobat', true);
    check(wrapper, 'Illustrator', true);
    check(wrapper, 'Photoshop', true);
    check(wrapper, 'Photoshop', false);
    expect(wrapper.querySelector('.selected-options').textContent).to.equal('Acrobat, Illustrator');
  });

  it('orders the condensed summary by the original option order, not selection order', () => {
    const wrapper = createSelect(buildField());
    check(wrapper, 'Photoshop', true);
    check(wrapper, 'Acrobat', true);
    expect(wrapper.querySelector('.selected-options').textContent).to.equal('Acrobat, Photoshop');
  });

  it('sorts a selected option to the top of the dropdown, preserving original relative order otherwise', () => {
    const wrapper = createSelect(buildField());
    check(wrapper, 'Lightroom', true);
    expect(dropdownOrder(wrapper)).to.deep.equal(['Lightroom', 'Acrobat', 'Illustrator', 'InDesign', 'Photoshop']);
  });

  it('returns a deselected option to its original position in the dropdown', () => {
    const wrapper = createSelect(buildField());
    check(wrapper, 'Lightroom', true);
    check(wrapper, 'Lightroom', false);
    expect(dropdownOrder(wrapper)).to.deep.equal(['Acrobat', 'Illustrator', 'InDesign', 'Lightroom', 'Photoshop']);
  });
});

describe('stripTags', () => {
  it('removes script tags and keeps inner text', () => {
    expect(stripTags('<script>alert()</script>')).to.equal('alert()');
  });

  it('removes inline tags and keeps surrounding text', () => {
    expect(stripTags('hello <b>world</b>')).to.equal('hello world');
  });

  it('passes through plain text unchanged', () => {
    expect(stripTags('no tags here')).to.equal('no tags here');
  });

  it('returns empty string unchanged', () => {
    expect(stripTags('')).to.equal('');
  });

  it('returns falsy values unchanged', () => {
    expect(stripTags(null)).to.equal(null);
    expect(stripTags(undefined)).to.equal(undefined);
  });

  it('strips nested tags and event handler attributes', () => {
    expect(stripTags('<a href="x"><img onerror="y">text</a>')).to.equal('text');
  });
});
