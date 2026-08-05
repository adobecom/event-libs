import { expect } from '@esm-bundle/chai';

import { mapEslPayloadToRawSessions, normalizeSessions } from '../../../../event-libs/v1/services/sessions/sessions-api.js';

function customAttr(name, values) {
  return { name, values };
}

function selectValue(label, value = label.toLowerCase()) {
  return { valueId: `${value}-id`, label, value, ordinal: 0 };
}

function textValue(value) {
  return { value, _ordinal: null };
}

describe('services/sessions/sessions-api', () => {
  describe('mapEslPayloadToRawSessions', () => {
    const payload = {
      speakers: [
        {
          speakerId: 'sp-1', firstName: 'Ada', lastName: 'Lovelace',
          localizations: { 'en-US': { title: 'Engineer' } },
        },
        {
          speakerId: 'sp-2', firstName: 'Grace', lastName: 'Hopper',
          localizations: { 'en-US': { title: 'Admiral' } },
        },
      ],
      sessionTimes: [
        { sessionId: 's-1', startTimeMillis: 2000, endTimeMillis: 3000 },
        { sessionId: 's-1', startTimeMillis: 1000, endTimeMillis: 1500 },
      ],
      sessions: [
        {
          sessionId: 's-1',
          sessionCode: 'S001',
          url: 'https://www.adobe.com/drafts/esp-dev/max/2025/sessions/full-stack-session-s001',
          sessionLengthInMinutes: 60,
          localizations: { 'en-US': { title: 'Full Stack Session', description: 'A session about everything.' } },
          speakers: [{ speakerId: 'sp-2', ordinal: 1 }, { speakerId: 'sp-1', ordinal: 0 }],
          images: [{ imageKind: 'session-hero-image', imageUrl: 'hero.jpg' }, { imageKind: 'session-card-image', imageUrl: 'card.jpg' }],
          customAttributes: [
            customAttr('Track', [selectValue('3D'), selectValue('Photography')]),
            customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Photography')]),
            customAttr('Programming Category', [selectValue('How To')]),
            customAttr('Technical Level', [selectValue('Intermediate')]),
            customAttr('Audience', [selectValue('Designer'), selectValue('Developer')]),
            customAttr('Session Type', [selectValue('Keynote')]),
            customAttr('Product', [selectValue('Adobe Photoshop', 'adobe-photoshop')]),
            customAttr('Format', [selectValue('In person', 'in-person'), selectValue('On demand, post event', 'on-demand-post-event')]),
            customAttr('Watch ', [textValue('<br><a href="https://example.com/watch" target="_blank">Watch</a>')]),
            customAttr('LegalDisclaimer', [textValue('<p>Copyright.</p>')]),
          ],
        },
        {
          // Minimal session: no times, no speakers, no matching customAttributes at all.
          sessionId: 's-2',
          sessionCode: 'S002',
          url: 'https://www.adobe.com/drafts/esp-dev/max/2025/sessions/bare-session-s002',
          enTitle: 'Bare Session',
          speakers: [],
          images: [],
          customAttributes: [],
        },
      ],
    };

    const [full, bare] = mapEslPayloadToRawSessions(payload);

    it('extracts title/description from en-US localizations', () => {
      expect(full.title).to.equal('Full Stack Session');
      expect(full.description).to.equal('A session about everything.');
    });

    it('falls back to enTitle when localizations are absent', () => {
      expect(bare.title).to.equal('Bare Session');
    });

    it('picks the earliest sessionTime for start/end', () => {
      expect(full.startTimeUtc).to.equal(new Date(1000).toISOString());
      expect(full.endTimeUtc).to.equal(new Date(1500).toISOString());
    });

    it('derives slug and sessionPageUrl from the drafts URL, not the URL itself', () => {
      expect(full.slug).to.equal('full-stack-session-s001');
      expect(full.sessionPageUrl).to.equal('/sessions/full-stack-session-s001');
      expect(full.rfCode).to.equal('S001');
    });

    it('maps track (single) and category (multi, topic) from separate attributes', () => {
      expect(full.track).to.equal('Photography');
      expect(full.category).to.deep.equal(['3D', 'Photography']);
      expect(full.contentCategory).to.deep.equal(['How To']);
    });

    it('maps technicalLevel, audience, and products', () => {
      expect(full.technicalLevel).to.equal('Intermediate');
      expect(full.audience).to.deep.equal(['Designer', 'Developer']);
      expect(full.products).to.deep.equal(['Adobe Photoshop']);
    });

    it('derives type/isKeynote from the Session Type customAttribute', () => {
      expect(full.type).to.equal('Keynote');
      expect(full.isKeynote).to.be.true;
    });

    it('derives inPerson/videoAvailable from Format values', () => {
      expect(full.inPerson).to.be.true;
      expect(full.videoAvailable).to.be.true;
    });

    it('extracts the watch href from the raw HTML anchor value', () => {
      expect(full.watchUrl).to.equal('https://example.com/watch');
    });

    it('picks the session-card-image thumbnail, not the hero image', () => {
      expect(full.thumbnailUrl).to.equal('card.jpg');
    });

    it('extracts the copyright disclaimer text', () => {
      expect(full.copyrightDisclaimer).to.equal('<p>Copyright.</p>');
    });

    it('joins speakers by id, sorted by ordinal', () => {
      expect(full.speakers.map((sp) => sp.name)).to.deep.equal(['Ada Lovelace', 'Grace Hopper']);
      expect(full.speakers[0].title).to.equal('Engineer');
      expect(full.speakers[0].photo).to.be.null;
    });

    it('leaves fields with no source in the payload unset on a bare session', () => {
      expect(bare.startTimeUtc).to.equal('');
      expect(bare.track).to.equal('');
      expect(bare.category).to.deep.equal([]);
      expect(bare.speakers).to.deep.equal([]);
      expect(bare.thumbnailUrl).to.be.null;
      expect(bare.isKeynote).to.be.false;
    });
  });

  describe('normalizeSessions', () => {
    it('defaults resources/mrStreamId even when the real-data mapper omits them', () => {
      const [normalized] = normalizeSessions([{ id: 's-1', category: ['3D'], audience: ['Designer'] }]);
      expect(normalized.resources).to.deep.equal([]);
      expect(normalized.mrStreamId).to.be.null;
    });

    it('coerces mock-style plain-string category/audience into arrays', () => {
      const [normalized] = normalizeSessions([{ id: 's-1', category: 'mainstage', audience: 'All' }]);
      expect(normalized.category).to.deep.equal(['mainstage']);
      expect(normalized.audience).to.deep.equal(['All']);
    });

    it('passes already-array-shaped category/audience/contentCategory through unchanged', () => {
      const [normalized] = normalizeSessions([{
        id: 's-1', category: ['3D', 'Photography'], contentCategory: ['How To'], audience: ['Designer', 'Developer'],
      }]);
      expect(normalized.category).to.deep.equal(['3D', 'Photography']);
      expect(normalized.contentCategory).to.deep.equal(['How To']);
      expect(normalized.audience).to.deep.equal(['Designer', 'Developer']);
    });

    it('defaults contentCategory to an empty array when absent (mock fixtures)', () => {
      const [normalized] = normalizeSessions([{ id: 's-1', category: 'mainstage', audience: 'All' }]);
      expect(normalized.contentCategory).to.deep.equal([]);
    });
  });
});
