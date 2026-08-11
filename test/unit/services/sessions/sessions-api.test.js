import { expect } from '@esm-bundle/chai';

import {
  mapEslPayloadToRawSessions, normalizeSessions, isSessionPublished, ENFORCE_PUBLISHED_FILTER,
} from '../../../../event-libs/v1/services/sessions/sessions-api.js';

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
        { sessionId: 's-1', startTimeMillis: 2000, endTimeMillis: 3000, externalSessionTimeId: 'rf-later' },
        { sessionId: 's-1', startTimeMillis: 1000, endTimeMillis: 1500, externalSessionTimeId: 'rf-earlier' },
      ],
      sessions: [
        {
          sessionId: 's-1',
          sessionCode: 'S001',
          externalSessionId: 'rf-full-session',
          url: 'https://www.adobe.com/drafts/esp-dev/max/2025/sessions/full-stack-session-s001',
          sessionLengthInMinutes: 60,
          localizations: { 'en-US': { title: 'Full Stack Session', description: 'A session about everything.' } },
          speakers: [{ speakerId: 'sp-2', ordinal: 1 }, { speakerId: 'sp-1', ordinal: 0 }],
          images: [{ imageKind: 'session-hero-image', imageUrl: 'hero.jpg' }, { imageKind: 'session-card-image', imageUrl: 'card.jpg' }],
          customAttributes: [
            customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Photography')]),
            customAttr('Programming Category', [selectValue('How To')]),
            customAttr('Technical Level', [selectValue('Intermediate')]),
            customAttr('Audience', [selectValue('Designer'), selectValue('Developer')]),
            customAttr('Session Type', [selectValue('Keynote')]),
            customAttr('Product', [selectValue('Adobe Photoshop', 'adobe-photoshop')]),
            customAttr('Format', [selectValue('In-Person', 'in-person'), selectValue('On demand, post event', 'on-demand-post-event')]),
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
    });

    it('takes rfCode from the earliest sessionTime\'s externalSessionTimeId, "rf-" prefix stripped', () => {
      expect(full.rfCode).to.equal('earlier');
    });

    it('leaves rfCode empty when there is no sessionTime to take it from', () => {
      expect(bare.rfCode).to.equal('');
    });

    it('takes rfSessionId from the session-level externalSessionId, "rf-" prefix stripped', () => {
      expect(full.rfSessionId).to.equal('full-session');
    });

    it('leaves rfSessionId empty when there is no externalSessionId at all', () => {
      expect(bare.rfSessionId).to.equal('');
    });

    it('maps track and contentCategory from separate attributes', () => {
      expect(full.track).to.equal('Photography');
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

    it('derives isOnline from Format specifically, not the broader videoAvailable', () => {
      // full's Format is In-Person + On demand, post event — no 'Online' value.
      expect(full.isOnline).to.be.false;
    });

    it('derives isLivestreamed from the Livestreamed Content customAttribute', () => {
      expect(full.isLivestreamed).to.be.false;
      expect(bare.isLivestreamed).to.be.false;
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
      expect(bare.speakers).to.deep.equal([]);
      expect(bare.thumbnailUrl).to.be.null;
      expect(bare.isKeynote).to.be.false;
    });
  });

  describe('isSessionPublished', () => {
    it('is false when a session is explicitly published: false', () => {
      expect(isSessionPublished({ published: false })).to.be.false;
    });

    it('is true when a session is explicitly published: true', () => {
      expect(isSessionPublished({ published: true })).to.be.true;
    });

    it('is true when a session has no published field at all', () => {
      expect(isSessionPublished({})).to.be.true;
    });
  });

  describe('mapEslPayloadToRawSessions published filtering', () => {
    const payload = {
      speakers: [],
      sessionTimes: [],
      sessions: [
        { sessionId: 'draft', sessionCode: 'D1', published: false, customAttributes: [] },
        { sessionId: 'live', sessionCode: 'L1', published: true, customAttributes: [] },
        { sessionId: 'no-field', sessionCode: 'N1', customAttributes: [] },
      ],
    };

    const mapped = mapEslPayloadToRawSessions(payload);

    // TEMPORARY: once ENFORCE_PUBLISHED_FILTER flips to true, this should assert 'draft'
    // is excluded and 'live'/'no-field' are included instead.
    it('does not filter out unpublished sessions while ENFORCE_PUBLISHED_FILTER is off', () => {
      expect(ENFORCE_PUBLISHED_FILTER).to.be.false;
      expect(mapped.map((s) => s.id)).to.deep.equal(['draft', 'live', 'no-field']);
    });
  });

  describe('mapEslPayloadToRawSessions Watch Now fields', () => {
    const payload = {
      speakers: [],
      sessionTimes: [],
      sessions: [
        {
          sessionId: 'homepage-live',
          customAttributes: [
            customAttr('Format', [selectValue('Online')]),
            customAttr('Livestreamed Content', [selectValue('Live')]),
          ],
        },
        {
          sessionId: 'broadcast-only',
          customAttributes: [customAttr('Format', [selectValue('Online')])],
        },
      ],
    };
    const [homepageLive, broadcastOnly] = mapEslPayloadToRawSessions(payload);

    it('sets both isLivestreamed and isOnline for a homepage livestream', () => {
      expect(homepageLive.isLivestreamed).to.be.true;
      expect(homepageLive.isOnline).to.be.true;
    });

    it('sets only isOnline for a broadcast-page-only session', () => {
      expect(broadcastOnly.isLivestreamed).to.be.false;
      expect(broadcastOnly.isOnline).to.be.true;
    });
  });

  describe('mapEslPayloadToRawSessions MAX26 field names (with MAX25 fallback)', () => {
    const max26Payload = {
      speakers: [],
      sessionTimes: [],
      sessions: [
        {
          sessionId: 'max26-session',
          customAttributes: [
            customAttr('Primary Event Site Track', [selectValue('Branding')]),
            customAttr('Category', [selectValue('Thought Leadership')]),
            customAttr('Type', [selectValue('Session')]),
            customAttr('Legal Disclaimer', [textValue('<p>MAX26 copyright.</p>')]),
            customAttr('Additional Event Site Tracks', [selectValue('Video, Audio & Motion', 'video-audio-and-motion'), selectValue('Branding')]),
            customAttr('Override Primary Event Site Track', [textValue('this is a test')]),
          ],
        },
        {
          // MAX25-shaped: old attribute names, no MAX26-only fields at all.
          sessionId: 'max25-session',
          customAttributes: [
            customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Branding')]),
            customAttr('Programming Category', [selectValue('How To')]),
          ],
        },
      ],
    };
    const [max26, max25] = mapEslPayloadToRawSessions(max26Payload);

    it('resolves the MAX26 track/category/type/disclaimer attribute names', () => {
      expect(max26.track).to.equal('Branding');
      expect(max26.contentCategory).to.deep.equal(['Thought Leadership']);
      expect(max26.type).to.equal('Session');
      expect(max26.copyrightDisclaimer).to.equal('<p>MAX26 copyright.</p>');
    });

    it('extracts additionalTracks (multi-select) and trackOverride (free text)', () => {
      expect(max26.additionalTracks).to.deep.equal(['Video, Audio & Motion', 'Branding']);
      expect(max26.trackOverride).to.equal('this is a test');
    });

    it('still resolves track/category via the MAX25 attribute names as a fallback', () => {
      expect(max25.track).to.equal('Branding');
      expect(max25.contentCategory).to.deep.equal(['How To']);
    });

    it('leaves additionalTracks/trackOverride empty for a MAX25-shaped session with neither field', () => {
      expect(max25.additionalTracks).to.deep.equal([]);
      expect(max25.trackOverride).to.equal('');
    });
  });

  describe('normalizeSessions', () => {
    it('defaults resources/mrStreamId even when the real-data mapper omits them', () => {
      const [normalized] = normalizeSessions([{ id: 's-1', audience: ['Designer'] }]);
      expect(normalized.resources).to.deep.equal([]);
      expect(normalized.mrStreamId).to.be.null;
    });

    it('coerces mock-style plain-string audience into an array', () => {
      const [normalized] = normalizeSessions([{ id: 's-1', audience: 'All' }]);
      expect(normalized.audience).to.deep.equal(['All']);
    });

    it('passes already-array-shaped audience/contentCategory through unchanged', () => {
      const [normalized] = normalizeSessions([{
        id: 's-1', contentCategory: ['How To'], audience: ['Designer', 'Developer'],
      }]);
      expect(normalized.contentCategory).to.deep.equal(['How To']);
      expect(normalized.audience).to.deep.equal(['Designer', 'Developer']);
    });

    it('defaults contentCategory to an empty array when absent (mock fixtures)', () => {
      const [normalized] = normalizeSessions([{ id: 's-1', audience: 'All' }]);
      expect(normalized.contentCategory).to.deep.equal([]);
    });
  });
});
