import { execFileSync } from 'node:child_process';

// `owner/repo` of the `origin` remote. gh otherwise follows its own default, which in a clone
// with an `upstream` remote can be the upstream repo, so PR lookups would hit the wrong repo.
export default function originRepo() {
  const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!match) throw new Error(`origin is not a GitHub remote: ${url}`);
  return match[1];
}
