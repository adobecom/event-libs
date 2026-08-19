import { expect } from '@esm-bundle/chai';

import {
  mapEslPayloadToRawSessions, normalizeSessions, isSessionPublished, ENFORCE_PUBLISHED_FILTER,
  getSessionProducts, extractDistinctProducts, sessionPageUrlForEnv,
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

    // The catalog's url already resolves the session's own page, so it passes through
    // untouched here — only its host is env-adjusted, in normalizeSessions.
    it('takes sessionPageUrl straight from the catalog url, and the slug from its last segment', () => {
      expect(full.slug).to.equal('full-stack-session-s001');
      expect(full.sessionPageUrl).to.equal('https://www.adobe.com/drafts/esp-dev/max/2025/sessions/full-stack-session-s001');
    });

    it('leaves sessionPageUrl empty when the session has no url at all', () => {
      const [noUrl] = mapEslPayloadToRawSessions({
        sessions: [{ sessionId: 's-3', sessionCode: 'S003', customAttributes: [] }],
        sessionTimes: [],
        speakers: [],
      });
      expect(noUrl.slug).to.equal('');
      expect(noUrl.sessionPageUrl).to.equal('');
    });

    it('strips a trailing .html when deriving the slug, leaving the url itself alone', () => {
      const url = 'https://www.adobe.com/max/2026/sessions/already-html-s004.html';
      const [withExt] = mapEslPayloadToRawSessions({
        sessions: [{
          sessionId: 's-4', sessionCode: 'S004', url, customAttributes: [],
        }],
        sessionTimes: [],
        speakers: [],
      });
      expect(withExt.slug).to.equal('already-html-s004');
      expect(withExt.sessionPageUrl).to.equal(url);
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

  describe('mapEslPayloadToRawSessions customAttributeValues', () => {
    // attributeId/inputType are the fields deriveFacetableAttributes()/the Session Guide
    // Configurator's authored filterCategories key off — customAttr() above omits them,
    // so existing fixtures above naturally produce an empty customAttributeValues map.
    function facetableAttr(attributeId, values, inputType = 'single-select') {
      return { attributeId, inputType, values, enabled: true };
    }

    const payload = {
      speakers: [],
      sessionTimes: [],
      sessions: [
        {
          sessionId: 's-1',
          customAttributes: [
            facetableAttr('attr-technical-level', [selectValue('Intermediate')]),
            facetableAttr('attr-audience', [selectValue('Designer'), selectValue('Developer')], 'multi-select'),
            facetableAttr('attr-region', [selectValue('AMER')]),
            facetableAttr('attr-disabled', [selectValue('Ignored')], 'single-select'),
            { ...facetableAttr('attr-free-text', [textValue('not indexable')]), inputType: 'text' },
          ],
        },
      ],
    };
    payload.sessions[0].customAttributes[3].enabled = false;

    const [session] = mapEslPayloadToRawSessions(payload);

    it('builds a generic attributeId-keyed map from any single/multi-select customAttribute', () => {
      expect(session.customAttributeValues['attr-technical-level']).to.deep.equal(['Intermediate']);
      expect(session.customAttributeValues['attr-audience']).to.deep.equal(['Designer', 'Developer']);
    });

    it('covers attributes with no hand-built flat field (e.g. Region) automatically', () => {
      expect(session.customAttributeValues['attr-region']).to.deep.equal(['AMER']);
    });

    it('excludes disabled attributes and non-select input types', () => {
      expect(session.customAttributeValues).to.not.have.property('attr-disabled');
      expect(session.customAttributeValues).to.not.have.property('attr-free-text');
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

    it('passes customAttributeValues through, defaulting to {} when absent', () => {
      const [withMap] = normalizeSessions([{ id: 's-1', customAttributeValues: { 'attr-1': ['A'] } }]);
      expect(withMap.customAttributeValues).to.deep.equal({ 'attr-1': ['A'] });
      const [withoutMap] = normalizeSessions([{ id: 's-2' }]);
      expect(withoutMap.customAttributeValues).to.deep.equal({});
    });

    // The test harness runs with Milo env "local", so the non-prod branch is what applies here.
    it('rewrites a prod-host session page URL to stage on a non-prod page', () => {
      const [normalized] = normalizeSessions([{
        id: 's-1', sessionPageUrl: 'https://www.adobe.com/max/2026/sessions/acom-test-1003-1',
      }]);
      expect(normalized.sessionPageUrl)
        .to.equal('https://www.stage.adobe.com/max/2026/sessions/acom-test-1003-1');
    });

    it('preserves the path, query, and hash while swapping only the host', () => {
      const [normalized] = normalizeSessions([{
        id: 's-1', sessionPageUrl: 'https://www.adobe.com/max/2026/sessions/a-b?x=1#top',
      }]);
      expect(normalized.sessionPageUrl)
        .to.equal('https://www.stage.adobe.com/max/2026/sessions/a-b?x=1#top');
    });

    it('leaves a root-relative or non-prod-host URL exactly as authored', () => {
      const [relative] = normalizeSessions([{ id: 's-1', sessionPageUrl: '/sessions/mock-slug' }]);
      expect(relative.sessionPageUrl).to.equal('/sessions/mock-slug');
      const [other] = normalizeSessions([{ id: 's-2', sessionPageUrl: 'https://example.com/s' }]);
      expect(other.sessionPageUrl).to.equal('https://example.com/s');
    });

    it('defaults a missing session page URL to an empty string', () => {
      const [normalized] = normalizeSessions([{ id: 's-1' }]);
      expect(normalized.sessionPageUrl).to.equal('');
    });
  });

  describe('sessionPageUrlForEnv', () => {
    const PROD_URL = 'https://www.adobe.com/max/2026/sessions/acom-test-1003-1';

    it('leaves the prod host alone on a prod page', () => {
      expect(sessionPageUrlForEnv(PROD_URL, true)).to.equal(PROD_URL);
    });

    it('swaps to the stage host on any non-prod page', () => {
      expect(sessionPageUrlForEnv(PROD_URL, false))
        .to.equal('https://www.stage.adobe.com/max/2026/sessions/acom-test-1003-1');
    });

    it('is a no-op for an empty URL, in either env', () => {
      expect(sessionPageUrlForEnv('', false)).to.equal('');
      expect(sessionPageUrlForEnv(undefined, true)).to.equal('');
    });

    it('returns an unparseable value untouched rather than throwing', () => {
      expect(sessionPageUrlForEnv('not a url', false)).to.equal('not a url');
    });
  });

  describe('getSessionProducts / extractDistinctProducts', () => {
    it('returns every product on a session (multi-select), not just the first', () => {
      const session = {
        customAttributes: [customAttr('Product', [selectValue('Photoshop'), selectValue('Illustrator')])],
      };
      expect(getSessionProducts(session)).to.deep.equal(['Photoshop', 'Illustrator']);
    });

    it('returns an empty array for a session with no Product attribute', () => {
      expect(getSessionProducts({ customAttributes: [] })).to.deep.equal([]);
    });

    it('collects the sorted union of distinct products across sessions', () => {
      const sessions = [
        { customAttributes: [customAttr('Product', [selectValue('Photoshop')])] },
        { customAttributes: [customAttr('Product', [selectValue('Illustrator'), selectValue('Photoshop')])] },
        { customAttributes: [] },
      ];
      expect(extractDistinctProducts(sessions)).to.deep.equal(['Illustrator', 'Photoshop']);
    });
  });
});
