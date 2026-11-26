import type { PluginServerContext, PluginHandlerContext } from '@getpaseo/plugin/server';
import { loadCandidates, loadStatus, requestReviewers } from './shared/reviewers';
import { github } from './server/github';

async function workspaceGithub(id: string, context: PluginHandlerContext) {
  const workspace = context.paseo.workspaces.ref(id);
  await workspace.refresh();
  if (!workspace.directory) throw new Error('Workspace directory is unavailable. Reopen the workspace and try again.');
  return github(workspace.directory);
}
export default function contribute(server: PluginServerContext) {
  server.handle(loadStatus, async (input, context) => (await workspaceGithub(input.workspaceId, context)).status());
  server.handle(loadCandidates, async (input, context) => (await workspaceGithub(input.workspaceId, context)).candidates());
  server.handle(requestReviewers, async (input, context) => (await workspaceGithub(input.workspaceId, context)).request(input));
  return () => {};
}
