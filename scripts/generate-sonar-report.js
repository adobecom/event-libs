#!/usr/bin/env node
// Runs the local Sonar-style (eslint-plugin-sonarjs) check and regenerates
// sonar-report.md at the repo root. Invoked via `npm run lint:sonar`.
import { spawnSync } from 'child_process';
import {
  writeFileSync, existsSync, mkdirSync, readFileSync,
} from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import sonarjs from 'eslint-plugin-sonarjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sonarDir = path.join(repoRoot, 'sonar');
if (!existsSync(sonarDir)) mkdirSync(sonarDir);
const cachePath = path.join(sonarDir, 'severity-cache.json');

// Build a ruleId -> Sonar RSPEC key (e.g. "S3776") lookup from the plugin's
// own rule metadata, so severity can be looked up per issue (see below).
const sonarKeyByRuleId = {};
Object.entries(sonarjs.rules).forEach(([shortName, rule]) => {
  const url = rule?.meta?.docs?.url || '';
  const match = url.match(/RSPEC[-/](S\d+)|rspec\/(S\d+)/);
  const key = match && (match[1] || match[2]);
  if (key) sonarKeyByRuleId[`sonarjs/${shortName}`] = key;
});

// Severity is not shipped with eslint-plugin-sonarjs, so we fetch it from
// SonarSource's public demo instance REST API (rules.sonarsource.com, the
// old public rule catalog, was decommissioned in early 2026 — see
// sonar/README.md). Results are cached in sonar/severity-cache.json so CI
// doesn't refetch every run and the report still works offline/if the demo
// instance is unreachable.
let cache = {};
if (existsSync(cachePath)) {
  try {
    cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
  } catch {
    cache = {};
  }
}

async function fetchSeverity(sonarKey) {
  if (cache[sonarKey]) return cache[sonarKey];
  try {
    const res = await fetch(`https://next.sonarqube.com/sonarqube/api/rules/show?key=javascript:${sonarKey}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { rule } = await res.json();
    const impact = rule?.impacts?.[0];
    const entry = {
      severity: rule?.severity || 'UNKNOWN',
      softwareQuality: impact?.softwareQuality || 'UNKNOWN',
      impactSeverity: impact?.severity || 'UNKNOWN',
      type: rule?.type || 'UNKNOWN',
    };
    cache[sonarKey] = entry;
    return entry;
  } catch (e) {
    console.warn(`Could not fetch severity for ${sonarKey}: ${e.message}`);
    return { severity: 'UNKNOWN', softwareQuality: 'UNKNOWN', impactSeverity: 'UNKNOWN', type: 'UNKNOWN' };
  }
}

const SEVERITY_ORDER = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO', 'UNKNOWN'];

// shell: false so the '**' glob is left intact for ESLint's own glob engine
// instead of being (incorrectly) expanded by /bin/sh, which lacks globstar.
const result = spawnSync(
  'npx',
  ['eslint', '--config', 'eslint.sonar.config.js', 'event-libs/**/*.js', '-f', 'json'],
  { cwd: repoRoot, encoding: 'utf-8', shell: false, maxBuffer: 1024 * 1024 * 50 },
);

if (result.error) {
  console.error('Failed to run eslint:', result.error);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(result.stdout);
} catch (e) {
  console.error('Failed to parse eslint JSON output:', e);
  console.error(result.stderr);
  process.exit(1);
}

const files = data.filter((f) => f.messages.length);
const total = files.reduce((a, f) => a + f.messages.length, 0);
const byRule = {};
files.forEach((f) => f.messages.forEach((m) => {
  byRule[m.ruleId] = (byRule[m.ruleId] || 0) + 1;
}));

const uniqueSonarKeys = [...new Set(Object.keys(byRule).map((r) => sonarKeyByRuleId[r]).filter(Boolean))];
const severityByKey = {};
await Promise.all(uniqueSonarKeys.map(async (key) => {
  severityByKey[key] = await fetchSeverity(key);
}));
writeFileSync(cachePath, JSON.stringify(cache, null, 2));

const severityCounts = {};
files.forEach((f) => f.messages.forEach((m) => {
  const sonarKey = sonarKeyByRuleId[m.ruleId];
  const sev = severityByKey[sonarKey]?.severity || 'UNKNOWN';
  severityCounts[sev] = (severityCounts[sev] || 0) + 1;
}));

let out = '# Sonar-style Code Quality Report\n\n';
out += `Generated via \`npm run lint:sonar\` (eslint-plugin-sonarjs) on ${new Date().toISOString().slice(0, 10)}.\n\n`;
out += `- Files scanned: ${data.length}\n- Files with issues: ${files.length}\n- Total issues: ${total}\n\n`;

out += '## Issues by severity\n\n| Severity | Count |\n|---|---|\n';
SEVERITY_ORDER.filter((s) => severityCounts[s]).forEach((s) => {
  out += `| ${s} | ${severityCounts[s]} |\n`;
});

out += '\n## Issues by rule\n\n| Rule | Sonar Key | Severity | Count |\n|---|---|---|---|\n';
Object.entries(byRule)
  .sort((a, b) => {
    const sevA = SEVERITY_ORDER.indexOf(severityByKey[sonarKeyByRuleId[a[0]]]?.severity || 'UNKNOWN');
    const sevB = SEVERITY_ORDER.indexOf(severityByKey[sonarKeyByRuleId[b[0]]]?.severity || 'UNKNOWN');
    return sevA - sevB || b[1] - a[1];
  })
  .forEach(([k, v]) => {
    const sonarKey = sonarKeyByRuleId[k] || '—';
    const severity = severityByKey[sonarKey]?.severity || '—';
    out += `| \`${k}\` | ${sonarKey} | ${severity} | ${v} |\n`;
  });

out += '\n## Issues by file\n\n';
files.forEach((f) => {
  const rel = path.relative(repoRoot, f.filePath);
  out += `### \`${rel}\`\n\n`;
  f.messages
    .slice()
    .sort((a, b) => {
      const sevA = SEVERITY_ORDER.indexOf(severityByKey[sonarKeyByRuleId[a.ruleId]]?.severity || 'UNKNOWN');
      const sevB = SEVERITY_ORDER.indexOf(severityByKey[sonarKeyByRuleId[b.ruleId]]?.severity || 'UNKNOWN');
      return sevA - sevB;
    })
    .forEach((m) => {
      const sonarKey = sonarKeyByRuleId[m.ruleId] || '—';
      const severity = severityByKey[sonarKey]?.severity || '—';
      out += `- L${m.line}:${m.column} \`${m.ruleId}\` (${sonarKey}, ${severity}) — ${m.message}\n`;
    });
  out += '\n';
});

writeFileSync(path.join(sonarDir, 'sonar-report.md'), out);
console.log(`sonar/sonar-report.md updated: ${total} issues across ${files.length} files.`);

// Surface the human-readable eslint output and propagate its exit code so
// CI (and local runs) fail when sonarjs issues are present.
const readable = spawnSync('npx', ['eslint', '--config', 'eslint.sonar.config.js', 'event-libs/**/*.js'], {
  cwd: repoRoot, stdio: 'inherit', shell: false,
});
process.exitCode = readable.status ?? 0;

