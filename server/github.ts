import { execFile } from 'node:child_process';
import { pull, requested, person, team } from '../shared/reviewers';
import { z } from 'zod';

export const NO_PULL_REQUEST_MESSAGE = 'No pull request found for this branch.';

export type Run = (args: string[], cwd: string, body?: unknown) => Promise<unknown>;
const runGh: Run = (args, cwd, body) => new Promise((resolve, reject) => {
  const child = execFile('gh', args, { cwd, timeout: 30000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' } }, (error, stdout, stderr) => {
    if (error) {
      if (typeof stderr === 'string' && /no pull requests? found/i.test(stderr)) {
        reject(new Error(NO_PULL_REQUEST_MESSAGE));
        return;
      }
      const code = typeof error.code === 'number' ? `exit ${error.code}` : error.code === 'ENOENT' ? 'gh missing' : error.killed ? 'timeout' : 'command failed';
      reject(new Error(`GitHub command failed (${code}). Check gh installation, authentication, repository access, and that this branch has a pull request on the Paseo host.`));
      return;
    }
    try { resolve(JSON.parse(stdout)); } catch { reject(new Error('GitHub returned an unreadable response. The panel retries automatically.')); }
  });
  child.stdin?.end(body === undefined ? undefined : JSON.stringify(body));
});

export function target(url: string) {
  const parsed = new URL(url);
  const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)$/.exec(parsed.pathname);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || !match) throw new Error('Only github.com pull requests are supported.');
  return `repos/${match[1]}/${match[2]}`;
}
export function github(cwd: string, run: Run = runGh) {
  const api = (endpoint: string, body?: unknown) => run(['api', '--hostname', 'github.com', endpoint, ...(body ? ['--method', 'POST', '--input', '-'] : [])], cwd, body);
  const pages = async (endpoint: string) => z.array(z.array(z.unknown())).parse(await run(['api', '--hostname', 'github.com', endpoint + '?per_page=100', '--paginate', '--slurp'], cwd)).flat();
  const current = async () => pull.extend({ latestReviews: z.array(z.object({ author: person, state: z.string() })) })
    .parse(await run(['pr', 'view', '--json', 'number,title,url,state,isDraft,author,reviewDecision,latestReviews'], cwd));
  const account = async () => person.parse(await api('user')).login;
  const read = async (url: string, number: number) => requested.parse(await api(`${target(url)}/pulls/${number}/requested_reviewers`));
  return {
    async status() {
      const { latestReviews, ...pr } = await current();
      const [login, requests] = await Promise.all([account(), read(pr.url, pr.number)]);
      const reviews = latestReviews.filter(r => r.state !== 'PENDING').map(r => ({ login: r.author.login, state: r.state }));
      return { account: login, pull: pr, requested: requests, reviews };
    },
    async candidates() {
      const pr = await current();
      const repo = target(pr.url);
      const warnings: string[] = [];
      const [people, teams] = await Promise.all([
        pages(`${repo}/collaborators`).then(x => z.array(person).parse(x)).catch(() => { warnings.push('People unavailable. Check GitHub connectivity and repository collaborator permissions.'); return []; }),
        pages(`${repo}/teams`).then(x => z.array(team).parse(x)).catch(() => { warnings.push('Teams unavailable. Check GitHub connectivity and organization team permissions.'); return []; }),
      ]);
      return { people: people.filter(p => p.login.toLowerCase() !== pr.author.login.toLowerCase()), teams, warnings };
    },
    async request(input: { pullUrl: string; account: string; users: string[]; teams: string[] }) {
      const pr = await current();
      if (pr.url !== input.pullUrl) throw new Error('The workspace pull request changed. Check the updated panel before requesting review.');
      if (await account() !== input.account) throw new Error('The GitHub account changed. Check the updated panel before requesting review.');
      if (pr.state !== 'OPEN' || pr.isDraft) throw new Error('Open the pull request and mark it ready for review first.');
      await api(`${target(pr.url)}/pulls/${pr.number}/requested_reviewers`, { reviewers: input.users, team_reviewers: input.teams });
      let result;
      try { result = await read(pr.url, pr.number); } catch { throw new Error('Request sent, but verification failed. Check GitHub before sending again.'); }
      const users = new Set(result.users.map(x => x.login.toLowerCase()));
      const teams = new Set(result.teams.map(x => x.slug.toLowerCase()));
      if (input.users.some(x => !users.has(x.toLowerCase())) || input.teams.some(x => !teams.has(x.toLowerCase()))) throw new Error('Request sent, but not all selected reviewers remain requested. Check GitHub before sending again.');
      return result;
    },
  };
}
