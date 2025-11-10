import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init, { convertToLocaleTimeFormat, convertEventTimeToLocalTime } from '../../../../event-libs/v1/blocks/event-agenda/event-agenda.js';
import { setMetadata } from '../../../../event-libs/v1/utils/utils.js';

const body = await readFile({ path: './mocks/default.html' });

describe('Agenda Module', () => {
  describe('convertToLocaleTimeFormat', () => {
    it('should convert time to locale format', () => {
      const time = '13:45:00';
      const locale = 'en-US';
      const formattedTime = convertToLocaleTimeFormat(time, locale);
      expect(formattedTime).to.equal('1:45 PM');
    });
  });

  describe('convertEventTimeToLocalTime', () => {
    it('should convert event timezone time to local time', () => {
      // Event on Jan 15, 2025 at 9:00 AM in America/Los_Angeles
      const eventDate = new Date('2025-01-15T00:00:00Z').getTime();
      const time = '09:00:00';
      const timezone = 'America/Los_Angeles';
      const locale = 'en-US';
      
      const formattedTime = convertEventTimeToLocalTime(time, timezone, eventDate, locale);
      
      // Result depends on user's timezone, but should be a valid time format
      expect(formattedTime).to.match(/\d{1,2}:\d{2}\s[AP]M/);
    });

    it('should handle string event date', () => {
      const eventDate = new Date('2025-01-15T00:00:00Z').getTime().toString();
      const time = '14:30:00';
      const timezone = 'America/New_York';
      const locale = 'en-US';
      
      const formattedTime = convertEventTimeToLocalTime(time, timezone, eventDate, locale);
      
      expect(formattedTime).to.match(/\d{1,2}:\d{2}\s[AP]M/);
    });

    it('should return empty string when missing required parameters', () => {
      expect(convertEventTimeToLocalTime('', 'America/Los_Angeles', 123456, 'en-US')).to.equal('');
      expect(convertEventTimeToLocalTime('09:00:00', '', 123456, 'en-US')).to.equal('');
      expect(convertEventTimeToLocalTime('09:00:00', 'America/Los_Angeles', '', 'en-US')).to.equal('');
    });

    it('should return empty string for invalid time format', () => {
      const eventDate = new Date('2025-01-15T00:00:00Z').getTime();
      const formattedTime = convertEventTimeToLocalTime('invalid', 'America/Los_Angeles', eventDate, 'en-US');
      expect(formattedTime).to.equal('');
    });
  });

  describe('init', () => {
    beforeEach(() => {
      document.body.innerHTML = body;
      document.head.innerHTML = '';
    });

    it('should create agenda container and items based on metadata', async () => {
      setMetadata('agenda', JSON.stringify([{ startTime: '09:00:00', title: 'Title', description: 'Opening' }]));
      setMetadata('photos', JSON.stringify([{ imageKind: 'venue-image', sharepointUrl: 'https://example.com/image.jpg', imageUrl: 'http://example.com/image.jpg', altText: 'Venue Image' }]));

      const el = document.querySelector('.event-agenda');
      await init(el);

      const container = el.querySelector('.agenda-container');
      expect(container).to.not.be.null;

      const itemsCol = container.querySelector('.agenda-items');
      expect(itemsCol).to.not.be.null;

      const agendaItem = itemsCol.querySelector('.agenda-list-item');
      expect(agendaItem).to.not.be.null;
      expect(agendaItem.querySelector('.agenda-time').textContent).to.equal('9:00 AM');
      expect(agendaItem.querySelector('.agenda-details').textContent).to.equal('Opening');
      expect(agendaItem.querySelector('.agenda-title').textContent).to.equal('Title');
    });

    it('should use relative sharepoint URL directly', async () => {
      setMetadata('agenda', JSON.stringify([{ startTime: '09:00:00', title: 'Title', description: 'Opening' }]));
      setMetadata('photos', JSON.stringify([{ imageKind: 'venue-image', sharepointUrl: '/example.com/image.jpg', imageUrl: 'http://example.com/image.jpg' }]));

      const el = document.querySelector('.event-agenda');
      await init(el);

      const container = el.querySelector('.agenda-container');
      expect(container).to.not.be.null;

      const itemsCol = container.querySelector('.agenda-items');
      expect(itemsCol).to.not.be.null;

      const agendaItem = itemsCol.querySelector('.agenda-list-item');
      expect(agendaItem).to.not.be.null;
      expect(agendaItem.querySelector('.agenda-time').textContent).to.equal('9:00 AM');
      expect(agendaItem.querySelector('.agenda-details').textContent).to.equal('Opening');
      expect(agendaItem.querySelector('.agenda-title').textContent).to.equal('Title');
    });

    it('should fallback on imageUrl when given invalid absolute sharepoint URL', async () => {
      setMetadata('agenda', JSON.stringify([{ startTime: '09:00:00', title: 'Title', description: 'Opening' }]));
      setMetadata('photos', JSON.stringify([{ imageKind: 'venue-image', sharepointUrl: 'https://////sdawd3123%O*&$/example.com/image.jpg', imageUrl: 'http://example.com/image.jpg' }]));

      const el = document.querySelector('.event-agenda');
      await init(el);

      const container = el.querySelector('.agenda-container');
      expect(container).to.not.be.null;

      const itemsCol = container.querySelector('.agenda-items');
      expect(itemsCol).to.not.be.null;

      const agendaItem = itemsCol.querySelector('.agenda-list-item');
      expect(agendaItem).to.not.be.null;
      expect(agendaItem.querySelector('.agenda-time').textContent).to.equal('9:00 AM');
      expect(agendaItem.querySelector('.agenda-title').textContent).to.equal('Title');
      expect(agendaItem.querySelector('.agenda-details').textContent).to.equal('Opening');
    });

    it('should use fallback values when metadata is incomplete', async () => {
      setMetadata('agenda', JSON.stringify([{ startTime: '09:00:00', title: 'Title', description: 'Opening' }]));
      setMetadata('photos', JSON.stringify([{ imageKind: 'venue-image', imageUrl: 'http://example.com/image.jpg' }]));

      const el = document.querySelector('.event-agenda');
      await init(el);

      const container = el.querySelector('.agenda-container');
      expect(container).to.not.be.null;

      const itemsCol = container.querySelector('.agenda-items');
      expect(itemsCol).to.not.be.null;

      const agendaItem = itemsCol.querySelector('.agenda-list-item');
      expect(agendaItem).to.not.be.null;
      expect(agendaItem.querySelector('.agenda-time').textContent).to.equal('9:00 AM');
      expect(agendaItem.querySelector('.agenda-title').textContent).to.equal('Title');
      expect(agendaItem.querySelector('.agenda-details').textContent).to.equal('Opening');
    });

    it('should not show title when title is empty', async () => {
      setMetadata('agenda', JSON.stringify([{ startTime: '09:00:00', title: '', description: 'Opening' }]));
      setMetadata('photos', JSON.stringify([{ imageKind: 'venue-image', imageUrl: 'http://example.com/image.jpg' }]));

      const el = document.querySelector('.event-agenda');
      await init(el);

      const container = el.querySelector('.agenda-container');
      expect(container).to.not.be.null;

      const itemsCol = container.querySelector('.agenda-items');
      expect(itemsCol).to.not.be.null;

      const agendaItem = itemsCol.querySelector('.agenda-list-item');
      expect(agendaItem).to.not.be.null;
      expect(agendaItem.querySelector('.agenda-time').textContent).to.equal('9:00 AM');
      expect(agendaItem.querySelector('.agenda-details').textContent).to.equal('Opening');
      expect(agendaItem.querySelector('.agenda-title')).to.be.null;
    });

    it('should not show description when description is empty', async () => {
      setMetadata('agenda', JSON.stringify([{ startTime: '09:00:00', title: 'Title' }]));
      setMetadata('photos', JSON.stringify([{ imageKind: 'venue-image', imageUrl: 'http://example.com/image.jpg' }]));

      const el = document.querySelector('.event-agenda');
      await init(el);

      const container = el.querySelector('.agenda-container');
      expect(container).to.not.be.null;

      const itemsCol = container.querySelector('.agenda-items');
      expect(itemsCol).to.not.be.null;

      const agendaItem = itemsCol.querySelector('.agenda-list-item');
      expect(agendaItem).to.not.be.null;
      expect(agendaItem.querySelector('.agenda-time').textContent).to.equal('9:00 AM');
      expect(agendaItem.querySelector('.agenda-title').textContent).to.equal('Title');
      expect(agendaItem.querySelector('.agenda-details')).to.be.null;
    });

    it('should show multiple agenda items', async () => {
      setMetadata('agenda', JSON.stringify([{ startTime: '09:00:00', title: 'Title', description: 'Opening' }, { startTime: '10:00:00', title: 'Title', description: 'Opening' }]));
      setMetadata('photos', JSON.stringify([{ imageKind: 'venue-image', imageUrl: 'http://example.com/image.jpg' }]));

      const el = document.querySelector('.event-agenda');
      await init(el);

      const container = el.querySelector('.agenda-container');
      expect(container).to.not.be.null;

      const itemsCol = container.querySelector('.agenda-items');
      expect(itemsCol).to.not.be.null;

      const agendaItem = itemsCol.querySelectorAll('.agenda-list-item');
      expect(agendaItem).to.not.be.null;
      expect(agendaItem.length).to.equal(2);
    });

    it('should handle invalid agenda metadata gracefully', async () => {
      setMetadata('agenda', 'invalid JSON');

      const el = document.querySelector('.event-agenda');
      await init(el);

      expect(el.parentNode).to.be.null;
    });

    it('should handle no agenda metadata gracefully', async () => {
      const el = document.querySelector('.event-agenda');
      await init(el);

      expect(el.parentNode).to.be.null;
    });

    it('should handle empty agenda metadata gracefully', async () => {
      setMetadata('agenda', JSON.stringify([]));
      const el = document.querySelector('.event-agenda');
      await init(el);

      expect(el.parentNode).to.be.null;
    });

    it('should remove element if metadata "show-agenda-post-event" is not "true" and body has eventState "post-event"', async () => {
      document.body.dataset.eventState = 'post-event';
      setMetadata('show-agenda-post-event', 'false');

      const el = document.querySelector('.event-agenda');
      await init(el);

      expect(el.parentNode).to.be.null;
    });
  });
});
