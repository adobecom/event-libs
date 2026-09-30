#!/usr/bin/env node
// Runs the local Sonar-style (eslint-plugin-sonarjs) check and regenerates
// sonar-report.md at the repo root. Invoked via `npm run lint:sonar`.
import { spawnSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

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

let out = '# Sonar-style Code Quality Report\n\n';
out += `Generated via \`npm run lint:sonar\` (eslint-plugin-sonarjs) on ${new Date().toISOString().slice(0, 10)}.\n\n`;
out += `- Files scanned: ${data.length}\n- Files with issues: ${files.length}\n- Total issues: ${total}\n\n`;
out += '## Issues by rule\n\n| Rule | Count |\n|---|---|\n';
Object.entries(byRule).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  out += `| \`${k}\` | ${v} |\n`;
});

out += '\n## Issues by file\n\n';
files.forEach((f) => {
  const rel = path.relative(repoRoot, f.filePath);
  out += `### \`${rel}\`\n\n`;
  f.messages.forEach((m) => {
    out += `- L${m.line}:${m.column} \`${m.ruleId}\` — ${m.message}\n`;
  });
  out += '\n';
});

const sonarDir = path.join(repoRoot, 'sonar');
if (!existsSync(sonarDir)) mkdirSync(sonarDir);
writeFileSync(path.join(sonarDir, 'sonar-report.md'), out);
console.log(`sonar/sonar-report.md updated: ${total} issues across ${files.length} files.`);

// Surface the human-readable eslint output too (non-zero exit is expected).
spawnSync('npx', ['eslint', '--config', 'eslint.sonar.config.js', 'event-libs/**/*.js'], {
  cwd: repoRoot, stdio: 'inherit', shell: false,
});
