import { expect } from '@esm-bundle/chai';

import {
  mapEslPayloadToRawSessions, normalizeSessions, isSessionPublished, isInPersonOnly, isMissingFormat,
  ENFORCE_PUBLISHED_FILTER,
  getSessionProducts, extractDistinctProducts, getProductAttributeId, sessionPageUrlForEnv, parseDvrDelayHours,
  getSessionAdditionalTracks, extractDistinctAllTracks,
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

// The mapper drops rows with no Format (see isMissingFormat), so every fixture needs one.
const ONLINE_FORMAT = customAttr('Format', [selectValue('Online')]);

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
            customAttr('Industry', [selectValue('Retail'), selectValue('Media')]),
            customAttr('Closed Caption Information', [textValue('Closed captions available in English and German')]),
            customAttr('IPOD or GDPR Copy', [textValue('Recording notice lorem ipsum.')]),
          ],
        },
        {
          // Minimal session: no times, no speakers, and no customAttribute the mapper reads
          // beyond the Format value every row must carry.
          sessionId: 's-2',
          sessionCode: 'S002',
          url: 'https://www.adobe.com/drafts/esp-dev/max/2025/sessions/bare-session-s002',
          enTitle: 'Bare Session',
          speakers: [],
          images: [],
          customAttributes: [ONLINE_FORMAT],
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
        sessions: [{ sessionId: 's-3', sessionCode: 'S003', customAttributes: [ONLINE_FORMAT] }],
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
          sessionId: 's-4', sessionCode: 'S004', url, customAttributes: [ONLINE_FORMAT],
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

    // One flag per Format value; no derived "is there video" field rolls them together.
    it('derives one flag per Format value', () => {
      // full's Format is In-Person + On demand, post event — no 'Online' value.
      expect(full.inPerson).to.be.true;
      expect(full.hasOnDemandFormat).to.be.true;
      expect(full.isOnline).to.be.false;
      expect(full).to.not.have.property('videoAvailable');
    });

    it('derives isLivestreamed from the Livestreamed Content customAttribute', () => {
      expect(full.isLivestreamed).to.be.false;
      expect(bare.isLivestreamed).to.be.false;
    });

    // The on-demand value is the whole rule, whatever else the row carries.
    it('flags an in-person, on-demand-only Format as hasOnDemandFormat', () => {
      expect(full.hasOnDemandFormat).to.be.true;
    });

    it('leaves a session with no on-demand Format value unflagged', () => {
      expect(bare.hasOnDemandFormat).to.be.false;
    });

    it('still flags a session that also carries the Online Format value', () => {
      const [both] = mapEslPayloadToRawSessions({
        sessions: [{
          sessionId: 'both',
          customAttributes: [customAttr('Format', [
            selectValue('In-Person'), selectValue('Online'), selectValue('On demand, post event'),
          ])],
        }],
      });
      expect(both.hasOnDemandFormat).to.be.true;
      // The Format value still means what it says elsewhere — only the guide's
      // live/upcoming placement is unconditional.
      expect(both.isOnline).to.be.true;
    });

    it('still flags a livestreamed session carrying the same on-demand Format', () => {
      const [streamed] = mapEslPayloadToRawSessions({
        sessions: [{
          sessionId: 'streamed',
          customAttributes: [
            customAttr('Format', [selectValue('In-Person'), selectValue('On demand, post event')]),
            customAttr('Livestreamed Content', [selectValue('Live')]),
          ],
        }],
      });
      expect(streamed.hasOnDemandFormat).to.be.true;
      expect(streamed.isLivestreamed).to.be.true;
    });

    // Verbatim from the real row that was still showing in Live & Upcoming — note the label is
    // `In person`, not the `In-Person` this rule was first written for.
    it('flags the real payload spelling, and reads its In person label', () => {
      const [real] = mapEslPayloadToRawSessions({
        sessions: [{
          sessionId: 'real',
          customAttributes: [{
            name: 'Format',
            attributeId: '3ae5e01d-fb31-4e76-a0ec-d80b6c5d53d3',
            inputType: 'multi-select',
            label: 'Format',
            enabled: true,
            values: [
              {
                valueId: '6a731a1b-9b31-4c41-9499-0e56753290d1', label: 'In person', value: 'in-person', ordinal: 0,
              },
              {
                valueId: '3a912a6c-970d-4e4e-8807-e906e2b8ebb5', label: 'On demand, post event', value: 'on-demand-post-event', ordinal: 1,
              },
            ],
          }],
        }],
      });
      expect(real.hasOnDemandFormat).to.be.true;
      expect(real.inPerson).to.be.true;
    });

    // A value with no localized label falls back to its slug, which no exact match would catch.
    it('flags the slug form of the value when the label is absent', () => {
      const [slugged] = mapEslPayloadToRawSessions({
        sessions: [{
          sessionId: 'slugged',
          customAttributes: [customAttr('Format', [
            { valueId: 'v1', value: 'in-person', ordinal: 0 },
            { valueId: 'v2', value: 'on-demand-post-event', ordinal: 1 },
          ])],
        }],
      });
      expect(slugged.hasOnDemandFormat).to.be.true;
      expect(slugged.inPerson).to.be.true;
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

    // Detail-view copy (Sessions Guide VizD R1). Both text attributes are rendered
    // verbatim, so the mapper must not reshape them.
    it('maps industry, closed captions, and the IPOD/GDPR notice', () => {
      expect(full.industry).to.deep.equal(['Retail', 'Media']);
      expect(full.closedCaptions).to.equal('Closed captions available in English and German');
      expect(full.legalCopy).to.equal('Recording notice lorem ipsum.');
    });

    it('accepts the alternate IPOD/GDPR attribute spelling', () => {
      const [alt] = mapEslPayloadToRawSessions({
        sessions: [{
          sessionId: 'alt',
          customAttributes: [ONLINE_FORMAT, customAttr('IPOD/GDPR Copy', [textValue('Slashed name.')])],
        }],
      });
      expect(alt.legalCopy).to.equal('Slashed name.');
    });

    it('leaves fields with no source in the payload unset on a bare session', () => {
      expect(bare.startTimeUtc).to.equal('');
      expect(bare.track).to.equal('');
      expect(bare.speakers).to.deep.equal([]);
      expect(bare.thumbnailUrl).to.be.null;
      expect(bare.isKeynote).to.be.false;
      expect(bare.industry).to.deep.equal([]);
      expect(bare.closedCaptions).to.equal('');
      expect(bare.legalCopy).to.equal('');
    });
  });

  describe('isInPersonOnly', () => {
    it('is true for a session whose only Format value is In-Person', () => {
      const [dropped] = mapEslPayloadToRawSessions({
        sessions: [
          { sessionId: 'in-person', customAttributes: [customAttr('Format', [selectValue('In-Person')])] },
          { sessionId: 'keeper', customAttributes: [customAttr('Format', [selectValue('Online')])] },
        ],
      });
      // The in-person-only row is gone, so the first mapped session is the online one.
      expect(dropped.id).to.equal('keeper');
    });

    it('keeps an in-person session that also airs online or is recorded', () => {
      expect(isInPersonOnly({ inPerson: true, isOnline: true })).to.be.false;
      expect(isInPersonOnly({ inPerson: true, isOnline: false, hasOnDemandFormat: true })).to.be.false;
    });

    // `Livestreamed Content` only routes a live Watch now; a row carrying both is mis-authored.
    it('is decided by Format alone — a stray livestream flag does not rescue the row', () => {
      expect(isInPersonOnly({ inPerson: true, isLivestreamed: true })).to.be.true;

      const mapped = mapEslPayloadToRawSessions({
        sessions: [
          {
            sessionId: 'in-person-livestreamed',
            customAttributes: [
              customAttr('Format', [selectValue('In-Person')]),
              customAttr('Livestreamed Content', [selectValue('Live')]),
            ],
          },
          { sessionId: 'keeper', customAttributes: [ONLINE_FORMAT] },
        ],
      });
      expect(mapped.map((s) => s.id)).to.deep.equal(['keeper']);
    });

    // No-Format sessions never reach this predicate — isMissingFormat drops them first.
    it('is false for a mapped session with no Format-derived flags set', () => {
      expect(isInPersonOnly({ inPerson: false })).to.be.false;
    });

    it('keeps the whole catalog when every session has a digital format', () => {
      const kept = mapEslPayloadToRawSessions({
        sessions: [
          { sessionId: 'a', customAttributes: [customAttr('Format', [selectValue('Online')])] },
          { sessionId: 'b', customAttributes: [customAttr('Format', [selectValue('In-Person'), selectValue('On demand, post event')])] },
        ],
      });
      expect(kept.map((s) => s.id)).to.deep.equal(['a', 'b']);
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

  // `772` is what every DVR-carrying session in the audited prod catalog uses.
  describe('DVR timing', () => {
    const mapWithDvr = (raw) => mapEslPayloadToRawSessions({
      sessions: [{
        sessionId: 'dvr',
        customAttributes: [ONLINE_FORMAT, customAttr('DVR Timing (in hours)', [textValue(raw)])],
      }],
    })[0];

    it('parses the authored hours off the session', () => {
      expect(mapWithDvr('772').dvrDelayHours).to.equal(772);
    });

    it('keeps 0 as 0 rather than collapsing it to unauthored', () => {
      expect(mapWithDvr('0').dvrDelayHours).to.equal(0);
    });

    // Whitespace has to fall to null, not 0 — Number(' ') is 0, which would read as
    // "available from the event start".
    it('is null for a blank, whitespace, or non-numeric value', () => {
      expect(mapWithDvr('').dvrDelayHours).to.be.null;
      expect(mapWithDvr('   ').dvrDelayHours).to.be.null;
      expect(mapWithDvr('soon').dvrDelayHours).to.be.null;
    });

    it('is null for a session with no DVR attribute at all', () => {
      const [noDvr] = mapEslPayloadToRawSessions({
        sessions: [{ sessionId: 'no-dvr', customAttributes: [ONLINE_FORMAT] }],
      });
      expect(noDvr.dvrDelayHours).to.be.null;
    });

    it('survives normalization, defaulting to null', () => {
      expect(normalizeSessions([mapWithDvr('772')])[0].dvrDelayHours).to.equal(772);
      expect(normalizeSessions([{ id: 's-1' }])[0].dvrDelayHours).to.be.null;
    });

    // Real prod values, mapped ahead of the playback work.
    it('carries the DVR playback fields through, verbatim', () => {
      const [session] = mapEslPayloadToRawSessions({
        sessions: [{
          sessionId: 'playback',
          customAttributes: [
            ONLINE_FORMAT,
            customAttr('Mobilerider Video ID (DVR)', [textValue('ubKVqWmTT5')]),
            customAttr('Skin ID', [textValue('adobe')]),
            // Not canonical HH:MM:SS — the catalog authors 60 minutes this way.
            customAttr('Video Duration', [textValue('00:60:00')]),
          ],
        }],
      });
      expect(session.dvrVideoId).to.equal('ubKVqWmTT5');
      expect(session.mrSkinId).to.equal('adobe');
      expect(session.videoDuration).to.equal('00:60:00');

      const [normalized] = normalizeSessions([session]);
      expect(normalized.dvrVideoId).to.equal('ubKVqWmTT5');
      expect(normalized.mrSkinId).to.equal('adobe');
      expect(normalized.videoDuration).to.equal('00:60:00');
    });

    it('defaults the playback fields to empty strings when unauthored', () => {
      const [normalized] = normalizeSessions([{ id: 's-1' }]);
      expect(normalized.dvrVideoId).to.equal('');
      expect(normalized.mrSkinId).to.equal('');
      expect(normalized.videoDuration).to.equal('');
    });

    it('parses the same values through the exported helper', () => {
      expect(parseDvrDelayHours('772')).to.equal(772);
      expect(parseDvrDelayHours(' 772 ')).to.equal(772);
      expect(parseDvrDelayHours('')).to.be.null;
      expect(parseDvrDelayHours('  ')).to.be.null;
      expect(parseDvrDelayHours(undefined)).to.be.null;
      expect(parseDvrDelayHours('-4')).to.be.null;
    });
  });

  // Modelled on the real "A.COM IPOD Test Session - MPC" row, whose customAttributes array is
  // empty on stage — it was defaulting into Upcoming with nothing to key off.
  describe('isMissingFormat', () => {
    it('is true for a row with an empty customAttributes array', () => {
      expect(isMissingFormat({ sessionId: 'mpc', customAttributes: [] })).to.be.true;
    });

    it('is true for a Format attribute carrying no values', () => {
      expect(isMissingFormat({ customAttributes: [customAttr('Format', [])] })).to.be.true;
    });

    it('is false as soon as any Format value is present', () => {
      expect(isMissingFormat({ customAttributes: [ONLINE_FORMAT] })).to.be.false;
    });

    it('drops the Format-less row from the mapped catalog, keeping its siblings', () => {
      const mapped = mapEslPayloadToRawSessions({
        speakers: [],
        sessionTimes: [],
        sessions: [
          { sessionId: 'mpc', enTitle: 'A.COM IPOD Test Session - MPC', customAttributes: [] },
          { sessionId: 'keeper', customAttributes: [ONLINE_FORMAT] },
        ],
      });
      expect(mapped.map((s) => s.id)).to.deep.equal(['keeper']);
    });

    // A dropped session is invisible, so the removal has to be traceable.
    it('logs the ids it dropped', () => {
      const logged = [];
      const originalLana = window.lana;
      window.lana = { log: (msg) => logged.push(msg) };
      mapEslPayloadToRawSessions({ sessions: [{ sessionId: 'mpc', customAttributes: [] }] });
      window.lana = originalLana;
      expect(logged.join('\n')).to.include('mpc');
    });
  });

  describe('mapEslPayloadToRawSessions published filtering', () => {
    const payload = {
      speakers: [],
      sessionTimes: [],
      sessions: [
        { sessionId: 'draft', sessionCode: 'D1', published: false, customAttributes: [ONLINE_FORMAT] },
        { sessionId: 'live', sessionCode: 'L1', published: true, customAttributes: [ONLINE_FORMAT] },
        { sessionId: 'no-field', sessionCode: 'N1', customAttributes: [ONLINE_FORMAT] },
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
            ONLINE_FORMAT,
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
            ONLINE_FORMAT,
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
            ONLINE_FORMAT,
            facetableAttr('attr-technical-level', [selectValue('Intermediate')]),
            facetableAttr('attr-audience', [selectValue('Designer'), selectValue('Developer')], 'multi-select'),
            facetableAttr('attr-region', [selectValue('AMER')]),
            facetableAttr('attr-disabled', [selectValue('Ignored')], 'single-select'),
            { ...facetableAttr('attr-free-text', [textValue('not indexable')]), inputType: 'text' },
          ],
        },
      ],
    };
    // By id, not index — inserting a fixture attribute must not disable the wrong one.
    payload.sessions[0].customAttributes
      .find((a) => a.attributeId === 'attr-disabled').enabled = false;

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

    it('carries the mapper-derived hasOnDemandFormat flag through, defaulting to false', () => {
      const [flagged] = normalizeSessions([{ id: 's-1', hasOnDemandFormat: true }]);
      const [plain] = normalizeSessions([{ id: 's-2' }]);
      expect(flagged.hasOnDemandFormat).to.be.true;
      expect(plain.hasOnDemandFormat).to.be.false;
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

    it('defaults the detail-view copy fields so the rows simply do not render', () => {
      const [normalized] = normalizeSessions([{ id: 's-1' }]);
      expect(normalized.industry).to.deep.equal([]);
      expect(normalized.closedCaptions).to.equal('');
      expect(normalized.legalCopy).to.equal('');
    });

    it('passes the detail-view copy fields through when present', () => {
      const [normalized] = normalizeSessions([{
        id: 's-1', industry: 'Retail', closedCaptions: 'Captions in English', legalCopy: 'Notice.',
      }]);
      expect(normalized.industry).to.deep.equal(['Retail']);
      expect(normalized.closedCaptions).to.equal('Captions in English');
      expect(normalized.legalCopy).to.equal('Notice.');
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

  // FilterPanel.js scopes product icons to the product filter category by this id, so an
  // Audience option like 'Illustrator' never renders one.
  describe('getProductAttributeId', () => {
    it('returns the Product attribute\'s own attributeId', () => {
      const session = {
        customAttributes: [
          { ...customAttr('Audience', [selectValue('Illustrator')]), attributeId: 'attr-audience' },
          { ...customAttr('Product', [selectValue('Illustrator')]), attributeId: 'attr-product' },
        ],
      };
      expect(getProductAttributeId(session)).to.equal('attr-product');
    });

    it('returns an empty string when the session has no Product attribute', () => {
      expect(getProductAttributeId({ customAttributes: [] })).to.equal('');
    });

    it('survives mapping and normalization onto the session', () => {
      const payload = {
        speakers: [],
        sessionTimes: [],
        sessions: [{
          sessionId: 's-1',
          customAttributes: [
            ONLINE_FORMAT,
            { ...customAttr('Product', [selectValue('Photoshop')]), attributeId: 'attr-product', inputType: 'multi-select' },
          ],
        }],
      };
      const [normalized] = normalizeSessions(mapEslPayloadToRawSessions(payload));
      expect(normalized.productAttributeId).to.equal('attr-product');
    });

    it('defaults to an empty string on a session normalized without one', () => {
      const [normalized] = normalizeSessions([{ id: 's-1' }]);
      expect(normalized.productAttributeId).to.equal('');
    });
  });
});

// Additional Event Site Tracks values are real tracks at render time — resolveTrackBadge()
// lanes them and LiveCard badges the first one — so a per-track icon map has to cover them.
describe('additional event site tracks', () => {
  const session = (primary, additional) => ({
    customAttributes: [
      customAttr('Primary Event Site Track', [selectValue(primary)]),
      customAttr('Additional Event Site Tracks', additional.map((a) => selectValue(a))),
    ],
  });

  it('reads every value of the multi-select, not just the first', () => {
    expect(getSessionAdditionalTracks(session('Design', ['Branding', 'Video']))).to.deep.equal(['Branding', 'Video']);
  });

  it('returns an empty array when the attribute is absent (MAX25 sessions)', () => {
    expect(getSessionAdditionalTracks({ customAttributes: [] })).to.deep.equal([]);
  });

  it('unions primary and additional tracks, deduped and sorted', () => {
    const sessions = [
      session('Design', ['Branding']),
      session('Branding', ['Video']),
    ];
    expect(extractDistinctAllTracks(sessions)).to.deep.equal(['Branding', 'Design', 'Video']);
  });

  it('still returns primary tracks when no session has additional ones', () => {
    const sessions = [{ customAttributes: [customAttr('Primary Event Site Track', [selectValue('Design')])] }];
    expect(extractDistinctAllTracks(sessions)).to.deep.equal(['Design']);
  });
});
