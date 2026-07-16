import { expect } from '@esm-bundle/chai';
import { resolveRsvpConfig } from '../../../../event-libs/v1/blocks/rsvp-form/config.js';
import { buildField } from '../../../../event-libs/v1/blocks/rsvp-form/fields.js';
import { constructPayload } from '../../../../event-libs/v1/blocks/rsvp-form/payload.js';
import { applyRules } from '../../../../event-libs/v1/blocks/rsvp-form/rules.js';
import { personalizeForm } from '../../../../event-libs/v1/blocks/rsvp-form/prefill.js';
import { validateForm, clearForm } from '../../../../event-libs/v1/blocks/rsvp-form/submit.js';

/**
 * Minimal stand-ins for the real Spectrum 2 web components, registered once
 * so createTag('sp-textfield', ...) etc. upgrade to elements exposing the
 * `.value`/`.checked`/`.invalid`/`checkValidity()` surface the block's logic
 * modules (payload.js, submit.js's validateForm) read. Real SWC behavior is
 * verified separately via the dev-server end-to-end check (see PLAN.md).
 */
function defineStub(tag) {
  if (customElements.get(tag)) return;
  customElements.define(tag, class extends HTMLElement {
    connectedCallback() {
      if (this._value === undefined) this._value = this.getAttribute('value') || '';
      if (this._checked === undefined) this._checked = this.hasAttribute('checked');
    }

    get value() { return this._value ?? this.getAttribute('value') ?? ''; }

    set value(v) { this._value = v; }

    get checked() { return this._checked ?? this.hasAttribute('checked'); }

    set checked(v) { this._checked = v; }

    get invalid() { return this._invalid ?? false; }

    set invalid(v) { this._invalid = v; }

    checkValidity() {
      if (this.hasAttribute('required') && !this.value && !this.checked) return false;
      return true;
    }
  });
}

['sp-theme', 'sp-textfield', 'sp-picker', 'sp-menu-item', 'sp-checkbox', 'sp-button', 'sp-field-label', 'sp-help-text', 'sp-divider'].forEach(defineStub);

function setRsvpConfigMeta(value) {
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'rsvp-config');
  meta.content = typeof value === 'string' ? value : JSON.stringify(value);
  document.head.appendChild(meta);
  return meta;
}

describe('rsvp-form', () => {
  afterEach(() => {
    document.head.querySelectorAll('meta[name="rsvp-config"]').forEach((m) => m.remove());
  });

  describe('config.js resolveRsvpConfig', () => {
    it('returns null when rsvp-config metadata is absent', () => {
      expect(resolveRsvpConfig()).to.equal(null);
    });

    it('returns null when rsvpFormFields is empty', () => {
      setRsvpConfigMeta({ rsvpFormFields: [] });
      expect(resolveRsvpConfig()).to.equal(null);
    });

    it('returns null and logs on malformed JSON', () => {
      setRsvpConfigMeta('{not json');
      expect(resolveRsvpConfig()).to.equal(null);
    });

    it('appends a synthetic submit field when none is authored', () => {
      setRsvpConfigMeta({ rsvpFormFields: [{ Field: 'firstName', Type: 'text' }] });
      const { fields } = resolveRsvpConfig();
      expect(fields.some((f) => f.type === 'submit')).to.equal(true);
    });

    it('does not duplicate an authored submit field', () => {
      setRsvpConfigMeta({
        rsvpFormFields: [{ Field: 'Submit', Type: 'submit', Label: 'Go' }],
      });
      const { fields } = resolveRsvpConfig();
      expect(fields.filter((f) => f.type === 'submit')).to.have.lengthOf(1);
    });

    it('maps required boolean true/false to "x"/""', () => {
      setRsvpConfigMeta({
        rsvpFormFields: [
          { Field: 'firstName', Type: 'text', Required: true },
          { Field: 'lastName', Type: 'text', Required: false },
        ],
      });
      const { fields } = resolveRsvpConfig();
      expect(fields.find((f) => f.field === 'firstName').required).to.equal('x');
      expect(fields.find((f) => f.field === 'lastName').required).to.equal('');
    });

    it('joins options given as strings or {value} objects', () => {
      setRsvpConfigMeta({
        rsvpFormFields: [{ Field: 'industry', Type: 'select', Options: ['Tech', { value: 'Retail' }] }],
      });
      const { fields } = resolveRsvpConfig();
      expect(fields.find((f) => f.field === 'industry').options).to.equal('Tech;Retail');
    });

    it('remaps select+radio displayAs to radio-group', () => {
      setRsvpConfigMeta({
        rsvpFormFields: [{ Field: 'jobLevel', Type: 'select', displayAs: 'radio', Options: ['IC', 'Manager'] }],
      });
      const { fields } = resolveRsvpConfig();
      expect(fields.find((f) => f.field === 'jobLevel').type).to.equal('radio-group');
    });

    it('remaps checkbox+dropdown displayAs to multi-select', () => {
      setRsvpConfigMeta({
        rsvpFormFields: [{ Field: 'productsOfInterest', Type: 'checkbox', displayAs: 'dropdown', Options: ['A', 'B'] }],
      });
      const { fields } = resolveRsvpConfig();
      expect(fields.find((f) => f.field === 'productsOfInterest').type).to.equal('multi-select');
    });
  });

  describe('fields.js buildField', () => {
    it('renders a text field with a label and a real sp-textfield control', () => {
      const wrapper = buildField({ field: 'firstName', type: 'text', label: 'First Name', required: 'x' });
      expect(wrapper.dataset.fieldId).to.equal('firstName');
      expect(wrapper.dataset.type).to.equal('text');
      expect(wrapper.dataset.required).to.equal('x');
      expect(wrapper.querySelector('sp-field-label')).to.exist;
      expect(wrapper.querySelector('sp-textfield')).to.exist;
    });

    it('renders sp-divider instead of the events-form.js empty-string bug', () => {
      const wrapper = buildField({ field: 'div1', type: 'divider' });
      expect(wrapper.querySelector('sp-divider')).to.exist;
    });

    it('renders no label for submit/clear/heading/legal/divider', () => {
      ['submit', 'clear', 'heading', 'legal', 'divider'].forEach((type) => {
        const wrapper = buildField({ field: `f-${type}`, type, label: 'x' });
        expect(wrapper.querySelector('sp-field-label')).to.equal(null);
      });
    });

    it('falls back to a hand-rolled radio-group when sp-radio-group is unavailable', () => {
      const wrapper = buildField({
        field: 'jobLevel', type: 'radio-group', label: 'Level', options: 'IC;Manager',
      });
      expect(wrapper.querySelector('.rsvp-form-radio-group')).to.exist;
      expect(wrapper.querySelectorAll('input[type="radio"]')).to.have.lengthOf(2);
    });

    it('falls back to a hand-rolled combobox when sp-combobox is unavailable', () => {
      const wrapper = buildField({
        field: 'productsOfInterest', type: 'multi-select', label: 'Products', options: 'A;B;C',
      });
      expect(wrapper.querySelector('.rsvp-form-combobox')).to.exist;
      expect(wrapper.querySelectorAll('.rsvp-form-combobox-listbox li')).to.have.lengthOf(3);
    });

    it('renders one sp-checkbox per option for checkbox-group', () => {
      const wrapper = buildField({
        field: 'contactMethods', type: 'checkbox-group', label: 'Contact', options: 'email;phone',
      });
      expect(wrapper.querySelectorAll('sp-checkbox')).to.have.lengthOf(2);
    });
  });

  describe('payload.js constructPayload', () => {
    let themeHost;

    beforeEach(() => {
      themeHost = document.createElement('sp-theme');
      document.body.appendChild(themeHost);
    });

    afterEach(() => themeHost.remove());

    it('reads text field values', () => {
      const wrapper = buildField({ field: 'firstName', type: 'text', label: 'First' });
      wrapper.querySelector('sp-textfield').value = 'Ada';
      themeHost.appendChild(wrapper);
      expect(constructPayload(themeHost)).to.deep.equal({ firstName: 'Ada' });
    });

    it('collapses a single-option checkbox group to a boolean', () => {
      const wrapper = buildField({ field: 'optIn', type: 'checkbox', label: 'Opt in', options: 'Yes' });
      wrapper.querySelector('sp-checkbox').checked = true;
      themeHost.appendChild(wrapper);
      expect(constructPayload(themeHost)).to.deep.equal({ optIn: true });
    });

    it('keeps a multi-option checkbox group as an array of checked values', () => {
      const wrapper = buildField({
        field: 'contactMethods', type: 'checkbox-group', label: 'Contact', options: 'email;phone',
      });
      const [email, phone] = wrapper.querySelectorAll('sp-checkbox');
      email.checked = true;
      phone.checked = false;
      themeHost.appendChild(wrapper);
      expect(constructPayload(themeHost)).to.deep.equal({ contactMethods: ['email'] });
    });

    it('reads the hand-rolled radio-group as a string', () => {
      const wrapper = buildField({
        field: 'jobLevel', type: 'radio-group', label: 'Level', options: 'IC;Manager',
      });
      themeHost.appendChild(wrapper);
      wrapper.querySelector('.rsvp-form-radio-group').value = 'Manager';
      expect(constructPayload(themeHost)).to.deep.equal({ jobLevel: 'Manager' });
    });

    it('reads the hand-rolled combobox as an array', () => {
      const wrapper = buildField({
        field: 'productsOfInterest', type: 'multi-select', label: 'Products', options: 'A;B',
      });
      themeHost.appendChild(wrapper);
      wrapper.querySelector('.rsvp-form-combobox').values = ['A', 'B'];
      expect(constructPayload(themeHost)).to.deep.equal({ productsOfInterest: ['A', 'B'] });
    });

    it('excludes non-input field types (submit/clear/heading/legal/divider) and the consent country field', () => {
      const submit = buildField({ field: 'Submit', type: 'submit', label: 'Go' });
      const country = document.createElement('div');
      country.dataset.fieldId = 'country';
      country.dataset.type = 'select';
      themeHost.append(submit, country);
      expect(constructPayload(themeHost)).to.deep.equal({});
    });
  });

  describe('rules.js applyRules', () => {
    let themeHost;

    beforeEach(() => {
      themeHost = document.createElement('sp-theme');
      document.body.appendChild(themeHost);
    });

    afterEach(() => themeHost.remove());

    it('hides a dependent field when the equal condition is not met', () => {
      const trigger = buildField({ field: 'accountType', type: 'text', label: 'Account Type' });
      const dependent = buildField({ field: 'companyName', type: 'text', label: 'Company' });
      themeHost.append(trigger, dependent);
      trigger.querySelector('sp-textfield').value = 'individual';

      applyRules(themeHost, [{
        fieldId: 'companyName',
        rule: { type: 'hidden', condition: { key: 'accountType', operator: '!=', value: 'business' } },
      }]);

      expect(dependent.classList.contains('hidden')).to.equal(true);
    });

    it('shows the dependent field once the condition is met', () => {
      const trigger = buildField({ field: 'accountType', type: 'text', label: 'Account Type' });
      const dependent = buildField({ field: 'companyName', type: 'text', label: 'Company' });
      themeHost.append(trigger, dependent);
      trigger.querySelector('sp-textfield').value = 'business';

      applyRules(themeHost, [{
        fieldId: 'companyName',
        rule: { type: 'hidden', condition: { key: 'accountType', operator: '!=', value: 'business' } },
      }]);

      expect(dependent.classList.contains('hidden')).to.equal(false);
    });
  });

  describe('submit.js validateForm', () => {
    let themeHost;

    beforeEach(() => {
      themeHost = document.createElement('sp-theme');
      document.body.appendChild(themeHost);
    });

    afterEach(() => themeHost.remove());

    it('flags an empty required field as invalid and blocks submission', () => {
      const wrapper = buildField({ field: 'email', type: 'email', label: 'Email', required: 'x' });
      themeHost.appendChild(wrapper);
      expect(validateForm(themeHost)).to.equal(false);
      expect(wrapper.classList.contains('is-invalid')).to.equal(true);
      expect(wrapper.querySelector('sp-help-text.rsvp-form-required-msg')).to.exist;
    });

    it('passes once the required field is filled', () => {
      const wrapper = buildField({ field: 'email', type: 'email', label: 'Email', required: 'x' });
      themeHost.appendChild(wrapper);
      wrapper.querySelector('sp-textfield').value = 'a@b.com';
      expect(validateForm(themeHost)).to.equal(true);
      expect(wrapper.classList.contains('is-invalid')).to.equal(false);
    });

    it('skips validation for hidden fields', () => {
      const wrapper = buildField({ field: 'companyName', type: 'text', label: 'Company', required: 'x' });
      wrapper.classList.add('hidden');
      themeHost.appendChild(wrapper);
      expect(validateForm(themeHost)).to.equal(true);
    });
  });

  describe('submit.js clearForm', () => {
    it('resets text fields and unchecks checkboxes', () => {
      const themeHost = document.createElement('sp-theme');
      const text = buildField({ field: 'firstName', type: 'text', label: 'First' });
      const check = buildField({ field: 'optIn', type: 'checkbox', label: 'Opt in', options: 'Yes' });
      text.querySelector('sp-textfield').value = 'Ada';
      check.querySelector('sp-checkbox').checked = true;
      themeHost.append(text, check);
      document.body.appendChild(themeHost);

      clearForm(themeHost);

      expect(text.querySelector('sp-textfield').value).to.equal('');
      expect(check.querySelector('sp-checkbox').checked).to.equal(false);
      themeHost.remove();
    });
  });

  describe('prefill.js personalizeForm', () => {
    it('prefills an empty field and disables it when sourced from the profile', () => {
      const themeHost = document.createElement('sp-theme');
      const wrapper = buildField({ field: 'firstName', type: 'text', label: 'First' });
      themeHost.appendChild(wrapper);
      document.body.appendChild(themeHost);

      personalizeForm(themeHost, { profile: { first_name: 'Ada' } });

      const control = wrapper.querySelector('sp-textfield');
      expect(control.value).to.equal('Ada');
      expect(control.disabled).to.equal(true);
      themeHost.remove();
    });

    it('does not overwrite a field the user already filled in', () => {
      const themeHost = document.createElement('sp-theme');
      const wrapper = buildField({ field: 'firstName', type: 'text', label: 'First' });
      wrapper.querySelector('sp-textfield').value = 'Grace';
      themeHost.appendChild(wrapper);
      document.body.appendChild(themeHost);

      personalizeForm(themeHost, { profile: { first_name: 'Ada' } });

      expect(wrapper.querySelector('sp-textfield').value).to.equal('Grace');
      themeHost.remove();
    });
  });
});
