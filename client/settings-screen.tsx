import { useSettings, type PluginSurfaceProps } from '@getpaseo/plugin/client';
import {
  ScrollView,
  SettingsAction,
  SettingsCard,
  SettingsSection,
  SettingsSwitch,
  useToast,
} from '@getpaseo/plugin/client/ui';
import { DEFAULT_PR_REVIEWERS_SETTINGS, prReviewersSettings } from '../shared/settings';

export function PrReviewersSettingsScreen(_props: PluginSurfaceProps) {
  const settings = useSettings(prReviewersSettings);
  const toast = useToast();
  const values = settings.status === 'ready' ? settings.values : DEFAULT_PR_REVIEWERS_SETTINGS;
  const ready = settings.status === 'ready';

  const save = async (patch: Partial<typeof values>) => {
    if (!ready) return;
    const ok = await settings.save({ ...settings.values, ...patch }, settings.revision);
    if (!ok) toast.error('Could not save PR Reviewers settings.');
  };

  return (
    <ScrollView style={{ flex: 1 }}>
      <SettingsSection title="Explorer behavior">
        <SettingsCard>
          <SettingsSwitch
            label="Auto-open Reviewers on PR workspaces"
            hint="Opens the Reviewers tab in the right Explorer sidebar once per workspace when a pull request is detected."
            value={values.autoOpenOnPr}
            disabled={!ready || settings.saving}
            onValueChange={(value) => void save({ autoOpenOnPr: value })}
          />
          <SettingsAction
            label="Reset auto-open history"
            hint={
              values.autoOpenedWorkspaces.length > 0
                ? `${values.autoOpenedWorkspaces.length} workspace(s) recorded as already opened.`
                : 'No workspaces recorded yet.'
            }
            actionLabel="Reset"
            disabled={!ready || settings.saving || values.autoOpenedWorkspaces.length === 0}
            onPress={() => {
              void save({ autoOpenedWorkspaces: [] }).then(() => {
                toast.show('Auto-open history cleared', { variant: 'info' });
              });
            }}
          />
        </SettingsCard>
      </SettingsSection>
    </ScrollView>
  );
}
