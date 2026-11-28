import type { PluginClientContext } from '@getpaseo/plugin/client';
import { startPrReviewersWatcher } from './client/pr-watcher';
import { ReviewersPanel } from './client/reviewers';
import { PrReviewersSettingsScreen } from './client/settings-screen';

export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addWorkspacePanel({
      id: 'reviewers',
      title: 'Reviewers',
      icon: 'Users',
      locations: ['workspace', 'explorer'],
      Component: ReviewersPanel,
    }),
    client.addSettingsScreen({
      id: 'pr-reviewers-settings',
      title: 'PR Reviewers',
      icon: 'Users',
      Component: PrReviewersSettingsScreen,
    }),
    startPrReviewersWatcher(client),
  ];

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
