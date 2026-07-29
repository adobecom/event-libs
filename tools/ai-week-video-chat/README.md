# AI Week demo: persona video chat

Adobe AI Week hackathon project. Adds a "chat about this session" feature to
each card in event-libs' `video-playlist` block: click the chat icon on a
session card, pick who you are (Designer / Photographer / Video Editor /
Marketer), and get an overview plus persona-tailored answers about that
session's content, with clickable timestamps.

Two extras beyond basic Q&A:

- **Voice in/out.** A mic button (Web Speech API, Chrome only, feature-detected
  - hidden entirely elsewhere) lets you ask by speaking instead of typing; the
  answer is auto-read back aloud when the question came in by voice. Every
  assistant message also gets a small speaker button so you can replay any
  answer (typed or spoken) on demand.
- **Cross-session recommendations.** Selecting a persona doesn't just tailor
  the answer for the current video - it also asks the model to recommend one
  *other* session from the same playlist worth watching next, with a reason
  grounded in that other session's real content. Clicking "Jump to this
  session" scrolls to and highlights that card and auto-opens its chat panel.
  This is the one thing the original vcx tool couldn't do at all (strictly
  one-video-at-a-time) - it only works here because persona + multi-transcript
  reasoning both live server-side already.

Loosely inspired by an earlier internal "chat with a video" POC
(`vcx`, Firefall/GPT-4-32k + Chroma + LangChain). This demo differs in three
ways: it's built directly into the actual event platform (video-playlist
cards) rather than a standalone page, it reasons about a *persona* rather than
just answering literal questions, and it uses Claude directly instead of
Firefall - with only 5 demo videos, a vector store is unnecessary overhead, so
each request just sends the full transcript straight to Claude.

## Running the demo

```bash
cd tools/ai-week-video-chat
npm install
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
npm start              # listens on http://localhost:8787
```

Then run the event-libs dev server as usual (`npm run event-libs` from the
repo root) and open a page with the `video-playlist` block. Each session card
will show a chat icon.

### No Anthropic key yet?

The backend falls back to OpenAI/Azure AI Foundry when `ANTHROPIC_API_KEY`
isn't set (logs a warning on startup either way, so it's obvious which one is
active). The `.env.example` defaults already point at Adobe's internal Azure
AI Foundry project (same one `~/browserstack-viewer` uses) via its
OpenAI-compatible Responses API - just set `OPENAI_API_KEY` and it works with
no other changes. Get an Anthropic key at console.anthropic.com when you can -
Claude is the model this demo is actually meant to showcase, per the
differentiation from vcx below.

## Endpoints

- `GET /api/personas` - the default persona list
- `GET /api/overview?videoId=<id>` - cached, neutral summary + highlight
  timestamps for a session (generated once, cached to `.cache/`)
- `POST /api/chat` - `{ videoId, persona, question, history }` -> `{ answer, timestamps }`
- `POST /api/recommend` - `{ videoId, persona }` -> `{ recommendation: { videoId, title, reason, highlightStart } | null }`,
  cached per `videoId`+`persona` pair. Reasons across *all* other transcripts
  server-side to pick the single best next session for that persona.

## Transcripts

`transcripts/*.json` currently hold **synthetic placeholder transcripts**
(`"synthetic": true`) for the 5 real MAX 2025 sessions already used by
`video-playlist`'s own mock data (`event-libs/v1/blocks/video-playlist/mock-chimera-response-new.json`).
They're hand-written from each session's real title/description so the demo
works end-to-end today without needing audio downloads or API spend.

To swap in real, Whisper-transcribed transcripts:

```bash
pip install -r requirements.txt   # needs ffmpeg on PATH separately
# add OPENAI_API_KEY to .env
python generate_transcripts.py                  # regenerate all 5
python generate_transcripts.py 3458860           # regenerate just one
```

This downloads each session's audio (Adobe TV pages are scraped for the real
mp4 source, the one YouTube session via `yt-dlp`), chunks it to stay under
Whisper's per-request size limit, transcribes each chunk with real
sentence-level timestamps, and overwrites the matching `transcripts/<id>.json`.

Note: this script calls the standard OpenAI Whisper endpoint
(`api.openai.com`), not the Azure AI Foundry project the server.js fallback
above uses - the Adobe Azure key may not have a Whisper deployment available
under that project. Confirm access (or get a standard platform.openai.com key)
before relying on this for the actual demo.

## Adding more sessions

Add an entry to `VIDEOS` in `generate_transcripts.py` and a card for it will
need to exist in the video-playlist mock/real data with a matching video ID -
the front-end keys everything off `data-video-id` on each `.session` card.
