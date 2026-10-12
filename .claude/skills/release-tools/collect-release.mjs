#!/usr/bin/env node
// Lists the PRs and Jira tickets included in a release (origin/<base>..origin/<head>).
// Usage: node .claude/skills/release-tools/collect-release.mjs stage dev
import { execFileSync } from 'node:child_process';
import originRepo from './origin-repo.mjs';

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  console.error('Usage: collect-release.mjs <base> <head>   e.g. stage dev | main stage');
  process.exit(1);
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const JIRA_RE = /\bMWPW-\d+\b/g;
const RELEASE_BRANCHES = new Set(['dev', 'stage', 'main']);
const REPO = originRepo();

run('git', ['fetch', '--quiet', 'origin', base, head]);
const subjects = run('git', ['log', `origin/${base}..origin/${head}`, '--format=%s']).split('\n').filter(Boolean);

// Squash merges end in "(#123)"; merge commits read "Merge pull request #123 from ...".
const numbers = [...new Set(subjects.flatMap((s) => [...s.matchAll(/(?:\(#|pull request #)(\d+)/g)].map((m) => Number(m[1]))))]
  .sort((a, b) => a - b);

const prs = numbers.map((number) => {
  try {
    const pr = JSON.parse(run('gh', ['pr', 'view', String(number), '-R', REPO, '--json', 'number,title,body,headRefName,baseRefName,author,mergedAt,url']));
    // Title, branch and "Resolves/Fixes/Closes" lines only: bodies often just mention other tickets.
    const resolvesLines = (pr.body || '').split('\n').filter((l) => /^\s*(resolves|fixes|closes)\b/i.test(l)).join('\n');
    const jira = [...new Set(`${pr.title}\n${pr.headRefName}\n${resolvesLines}`.match(JIRA_RE) || [])];
    return {
      number: pr.number,
      title: pr.title,
      author: pr.author?.login,
      head: pr.headRefName,
      base: pr.baseRefName,
      mergedAt: pr.mergedAt,
      url: pr.url,
      jira,
      // Earlier dev->stage / stage->main promotions are listed separately, not as features.
      isPromotion: RELEASE_BRANCHES.has(pr.headRefName) && RELEASE_BRANCHES.has(pr.baseRefName),
    };
  } catch {
    return { number, error: 'not found via gh' };
  }
});

const features = prs.filter((p) => !p.isPromotion && !p.error);

// True when merging head into base changes nothing (e.g. the same work already reached base via
// another PR), so the promotion would be a no-op. Needs git 2.38+ for merge-tree --write-tree.
let alreadyInBase = null;
try {
  const merged = run('git', ['merge-tree', '--write-tree', `origin/${base}`, `origin/${head}`]).split('\n')[0];
  alreadyInBase = merged === run('git', ['rev-parse', `origin/${base}^{tree}`]);
} catch {
  // Conflicts or an older git: leave it unknown.
}
console.log(JSON.stringify({
  repo: REPO,
  range: `origin/${base}..origin/${head}`,
  commits: subjects.length,
  alreadyInBase,
  features,
  promotions: prs.filter((p) => p.isPromotion),
  unresolved: prs.filter((p) => p.error),
  jira: [...new Set(features.flatMap((p) => p.jira))].sort(),
  noJira: features.filter((p) => !p.jira.length).map((p) => p.number),
}, null, 2));
