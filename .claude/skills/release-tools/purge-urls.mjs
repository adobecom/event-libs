#!/usr/bin/env node
// Builds the Akamai purge URL list for a prod release.
// Prefers the "Changed files for cache purging" bot comment on the release PR (--pr <n>); falls
// back to a local diff with the same filters as .github/workflows/pr-changed-files-comment.yml.
// Usage: node .claude/skills/release-tools/purge-urls.mjs main stage [--pr 525] [--verify]
import { execFileSync } from 'node:child_process';
import originRepo from './origin-repo.mjs';

const args = process.argv.slice(2);
const prIndex = args.indexOf('--pr');
const pr = prIndex >= 0 ? args[prIndex + 1] : null;
const positional = prIndex >= 0 ? args.filter((_, i) => i !== prIndex && i !== prIndex + 1) : args;
const [base = 'main', head = 'stage'] = positional;

const HOSTS = ['https://www.adobe.com', 'https://business.adobe.com'];
const MARKER = '<!-- pr-changed-files-comment -->';
const run = (cmd, a) => execFileSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

// Mirrors pr-changed-files-comment.yml so the local fallback matches the bot.
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc', '.doc', '.docx', '.pdf', '.rtf']);
const DOC_BASENAMES = new Set(['license', 'changelog', 'contributing', 'notice', 'authors', 'readme']);
const IGNORED_TOP_LEVEL_DIRS = new Set(['test', 'docs']);
const IGNORED_BASENAMES = new Set(['package.json', 'package-lock.json', 'eslint.config.js', 'web-test-runner.config.js']);

function isDocFile(path) {
  const name = path.split('/').pop();
  const dot = name.lastIndexOf('.');
  if (dot === -1) return DOC_BASENAMES.has(name.toLowerCase());
  return DOC_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

function isNonServedFile(path) {
  const segments = path.split('/');
  const name = segments[segments.length - 1];
  return segments.some((s) => s.startsWith('.'))
    || IGNORED_TOP_LEVEL_DIRS.has(segments[0])
    || IGNORED_BASENAMES.has(name)
    || /\.test\.js$/.test(name);
}

let files = null;
let source = '';
if (pr) {
  const comments = JSON.parse(run('gh', ['api', `repos/${originRepo()}/issues/${pr}/comments`, '--paginate']));
  const bot = comments.find((c) => c.body.includes(MARKER));
  if (bot) {
    files = [...bot.body.matchAll(/^<domain>\/(.+)$/gm)].map((m) => m[1].trim());
    source = `bot comment on PR #${pr}`;
  }
}
if (!files) {
  run('git', ['fetch', '--quiet', 'origin', base, head]);
  files = run('git', ['diff', '--name-only', `origin/${base}...origin/${head}`])
    .split('\n').filter(Boolean)
    .filter((f) => !isDocFile(f) && !isNonServedFile(f))
    .sort();
  source = `local diff origin/${base}...origin/${head}`;
}

const urls = HOSTS.flatMap((host) => files.map((f) => `${host}/${f}`));

// --verify: after purging, compare each prod URL with the freshly deployed main branch on aem.live.
if (args.includes('--verify')) {
  const ORIGIN = 'https://main--event-libs--adobecom.aem.live';
  const text = async (u) => { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? r.text() : `HTTP ${r.status}`; };
  const stale = [];
  const queue = [...files];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const f = queue.shift();
      const expected = await text(`${ORIGIN}/${f}`);
      for (const host of HOSTS) {
        const actual = await text(`${host}/${f}`);
        if (actual !== expected) stale.push(`${host}/${f}`);
      }
    }
  }));
  console.log(`# verify: ${urls.length - stale.length}/${urls.length} URLs match ${ORIGIN} (source: ${source})`);
  if (stale.length) console.log(`# STALE — purge again:\n${stale.sort().join('\n')}`);
  process.exit(stale.length ? 2 : 0);
}

console.log(`# ${files.length} files x ${HOSTS.length} hosts = ${urls.length} URLs (source: ${source})`);
console.log(urls.join('\n'));
