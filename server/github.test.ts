import { test } from 'node:test';
import assert from 'node:assert/strict';
import { github, target, type Run } from './github';

const pr = { number: 1, title: 'Example', url: 'https://github.com/example/repo/pull/1', state: 'OPEN', isDraft: false, author: { login: 'author' } };
function fixture(options: { missing?: boolean; draft?: boolean; changed?: boolean; failTeams?: boolean } = {}) {
  let posted = false;
  const writes: unknown[] = [];
  const run: Run = async (args, _cwd, body) => {
    if (args[0] === 'pr') return { ...pr, isDraft: !!options.draft, url: options.changed ? pr.url + '2' : pr.url };
    const endpoint = args[3];
    if (endpoint === 'user') return { login: 'owner' };
    if (body) { posted = true; writes.push(body); return {}; }
    if (endpoint.includes('requested_reviewers')) {
      return { users: posted && !options.missing ? [{ login: 'reviewer' }] : [], teams: posted ? [{ slug: 'backend', name: 'Backend' }] : [] };
    }
    if (endpoint.includes('collaborators')) return [[{ login: 'author' }], [{ login: 'reviewer' }]];
    if (options.failTeams) throw new Error('HTTP 403');
    return [[{ slug: 'backend', name: 'Backend' }]];
  };
  return { api: github('/workspace', run), writes };
}
const input = { pullUrl: pr.url, account: 'owner', users: ['reviewer'], teams: ['backend'] };
test('loads every page and excludes the PR author', async () => {
  const result = await fixture().api.load();
  assert.deepEqual(result.people, [{ login: 'reviewer' }]);
  assert.equal(result.account, 'owner');
});
test('optional team permission failure is visible while people remain usable', async () => {
  const result = await fixture({ failTeams: true }).api.load();
  assert.equal(result.people.length, 1); assert.equal(result.warnings.length, 1);
});
test('sends explicit user and team lists and verifies readback', async () => {
  const f = fixture(); const result = await f.api.request(input);
  assert.deepEqual(f.writes, [{ reviewers: ['reviewer'], team_reviewers: ['backend'] }]);
  assert.equal(result.users[0].login, 'reviewer');
});
test('does not claim success when a selected reviewer is absent', async () => {
  await assert.rejects(fixture({ missing: true }).api.request(input));
});
for (const [name, options, request] of [
  ['draft', { draft: true }, input],
  ['changed PR', { changed: true }, input],
  ['changed account', {}, { ...input, account: 'other' }],
] as const) test(`rejects ${name} before writing`, async () => {
  const f = fixture(options); await assert.rejects(f.api.request(request)); assert.equal(f.writes.length, 0);
});
test('supports github.com and rejects unsupported hosts', () => {
  assert.equal(target(pr.url), 'repos/example/repo');
  assert.throws(() => target('https://enterprise.example/org/repo/pull/1'));
});
