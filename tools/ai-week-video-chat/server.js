import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTS_DIR = path.join(__dirname, 'transcripts');
const CACHE_DIR = path.join(__dirname, '.cache');
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
// Adobe's internal Azure AI Foundry project (same one browserstack-viewer
// uses) - an OpenAI-compatible Responses API, not the classic OpenAI REST
// shape, and not Azure's older /openai/deployments/.../chat/completions shape.
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL
  || 'https://stream-resource.services.ai.azure.com/api/projects/stream/openai/v1';

// Claude is the intended model for this demo (see README) - OpenAI/Azure AI
// Foundry is only a stopgap fallback for testing before an ANTHROPIC_API_KEY
// is available.
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: OPENAI_BASE_URL }) : null;

if (!anthropic && !openai) {
  console.error('Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY in .env - see README.');
  process.exit(1);
}
if (!anthropic) {
  console.warn('ANTHROPIC_API_KEY not set - falling back to OpenAI/Azure AI Foundry. Switch to Claude once you have a key.');
}

async function completeText(system, messages, maxTokens) {
  if (anthropic) {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages,
    });
    return message.content?.[0]?.text || '';
  }

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    max_output_tokens: maxTokens,
    instructions: system,
    input: messages,
  });
  return response.output_text || '';
}

// Default persona set for the AI Week demo. Selecting one reframes which parts
// of the same transcript get surfaced as relevant, rather than changing the
// underlying retrieval - the reframing itself is the point being demoed.
const PERSONAS = [
  { id: 'designer', label: 'Designer', blurb: 'Visual design, branding, and creative workflows' },
  { id: 'photographer', label: 'Photographer', blurb: 'Photography, visual storytelling, and image craft' },
  { id: 'video-editor', label: 'Video Editor', blurb: 'Editing, pacing, color, and post-production' },
  { id: 'marketer', label: 'Marketer', blurb: 'Campaigns, audience growth, and content strategy' },
];

async function loadTranscript(videoId) {
  const filePath = path.join(TRANSCRIPTS_DIR, `${videoId}.json`);
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function loadAllTranscripts() {
  const files = await fs.readdir(TRANSCRIPTS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  return Promise.all(jsonFiles.map(async (file) => {
    const raw = await fs.readFile(path.join(TRANSCRIPTS_DIR, file), 'utf-8');
    return JSON.parse(raw);
  }));
}

function formatSeconds(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function transcriptToContext(transcript) {
  return transcript.segments
    .map((seg) => `[${formatSeconds(seg.start)} / ${seg.start}s] ${seg.text}`)
    .join('\n');
}

function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

async function cacheRead(key) {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${key}.json`), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function cacheWrite(key, value) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(value, null, 2));
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/personas', (_req, res) => res.json({ personas: PERSONAS }));

app.get('/api/overview', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  const cached = await cacheRead(`overview-${videoId}`);
  if (cached) return res.json(cached);

  try {
    const transcript = await loadTranscript(videoId);
    const system = `You are a video content analyst. You are given a timestamped transcript of one MAX session video. Summarize it and suggest a few timestamps worth jumping to.

Respond with ONLY valid JSON, no markdown fences, matching exactly:
{"overview": string (2-3 sentences), "highlights": [{"start": number (seconds), "label": string (short phrase)}]}

Provide 3-4 highlights, ordered by their start time.`;

    const text = await completeText(system, [{
      role: 'user',
      content: `Video title: ${transcript.title}\n\nTranscript:\n${transcriptToContext(transcript)}`,
    }], 600);

    const parsed = extractJson(text);
    const result = { videoId, title: transcript.title, ...parsed };
    await cacheWrite(`overview-${videoId}`, result);
    res.json(result);
  } catch (err) {
    console.error('[overview] failed', err);
    res.status(500).json({ error: 'Failed to generate overview' });
  }
});

app.post('/api/chat', async (req, res) => {
  const {
    videoId, persona, question, history = [],
  } = req.body || {};
  if (!videoId || !question) {
    return res.status(400).json({ error: 'videoId and question are required' });
  }

  try {
    const transcript = await loadTranscript(videoId);
    const personaMeta = PERSONAS.find((p) => p.id === persona);
    const personaLine = personaMeta
      ? `The user is a ${personaMeta.label} (${personaMeta.blurb}). Prioritize the parts of this session most relevant to that persona's interests.`
      : 'No persona has been selected - answer neutrally, covering the session generally.';

    const system = `You are a helpful assistant answering questions about one MAX session video, using only the timestamped transcript given below. ${personaLine}
If the transcript doesn't cover something, say so plainly instead of guessing.

Respond with ONLY valid JSON, no markdown fences, matching exactly:
{"answer": string, "timestamps": [{"start": number (seconds), "label": string (short phrase)}]}

Include 0-3 timestamps, only ones directly relevant to your answer, ordered by start time.

Video title: ${transcript.title}

Transcript:
${transcriptToContext(transcript)}`;

    const historyMessages = history
      .slice(-6)
      .filter((turn) => turn?.role && turn?.content)
      .map((turn) => ({ role: turn.role, content: turn.content }));

    const text = await completeText(
      system,
      [...historyMessages, { role: 'user', content: question }],
      700,
    );

    let parsed;
    try {
      parsed = extractJson(text);
    } catch {
      parsed = { answer: text, timestamps: [] };
    }

    res.json({ videoId, ...parsed });
  } catch (err) {
    console.error('[chat] failed', err);
    res.status(500).json({ error: 'Failed to answer question' });
  }
});

app.post('/api/recommend', async (req, res) => {
  const { videoId, persona } = req.body || {};
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  const personaMeta = PERSONAS.find((p) => p.id === persona);
  const cacheKey = `recommend-${videoId}-${persona || 'none'}`;
  const cached = await cacheRead(cacheKey);
  if (cached) return res.json(cached);

  try {
    const allTranscripts = await loadAllTranscripts();
    const current = allTranscripts.find((t) => t.videoId === videoId);
    const others = allTranscripts.filter((t) => t.videoId !== videoId);
    if (!current || !others.length) return res.json({ recommendation: null });

    const personaLine = personaMeta
      ? `The user is a ${personaMeta.label} (${personaMeta.blurb}), currently exploring "${current.title}".`
      : `The user is currently exploring "${current.title}" with no persona selected.`;

    const catalog = others.map((t) => `--- ${t.videoId}: "${t.title}" ---\n${transcriptToContext(t)}`).join('\n\n');

    const system = `You recommend ONE other MAX session video worth watching next, out of a small catalog, based on what the user is currently exploring. ${personaLine}

Respond with ONLY valid JSON, no markdown fences, matching exactly:
{"videoId": string (must be one of the candidate video IDs below), "reason": string (one sentence, specific to the persona and this session's actual content), "highlightStart": number (seconds, a real timestamp from that video worth jumping straight to)}

If truly none of the candidates are a good fit, respond with {"videoId": null, "reason": null, "highlightStart": null} instead.

Candidate sessions:
${catalog}`;

    const text = await completeText(system, [{
      role: 'user',
      content: `What should this person watch next, and why - referencing something specific from that session?`,
    }], 400);

    const parsed = extractJson(text);
    let recommendation = null;
    if (parsed.videoId) {
      const match = others.find((t) => t.videoId === parsed.videoId);
      if (match) {
        recommendation = {
          videoId: match.videoId, title: match.title, reason: parsed.reason, highlightStart: parsed.highlightStart,
        };
      }
    }

    const result = { recommendation };
    await cacheWrite(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[recommend] failed', err);
    res.status(500).json({ error: 'Failed to generate a recommendation' });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`AI Week video-chat backend listening on http://localhost:${port}`);
});
