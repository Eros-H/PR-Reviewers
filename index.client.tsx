import type { PluginClientContext } from '@getpaseo/plugin/client';
import { ReviewersPanel } from './client/reviewers';
export default function contribute(client: PluginClientContext) {
  return client.addWorkspacePanel({ id: 'reviewers', title: 'Reviewers', icon: 'Users', locations: ['workspace', 'explorer'], Component: ReviewersPanel });
}
