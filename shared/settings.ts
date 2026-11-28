import { defineSettings } from '@getpaseo/plugin';
import { z } from 'zod';

export const PrReviewersSettingsSchema = z.object({
  /** Automatically open the Reviewers panel in Explorer once per workspace when a PR exists. */
  autoOpenOnPr: z.boolean().default(true),
  /** Workspace IDs already auto-opened once on this device so closing the tab stays closed. */
  autoOpenedWorkspaces: z.array(z.string()).default([]),
});

export type PrReviewersSettings = z.infer<typeof PrReviewersSettingsSchema>;

export const DEFAULT_PR_REVIEWERS_SETTINGS: PrReviewersSettings = PrReviewersSettingsSchema.parse({});

export const prReviewersSettings = defineSettings({
  id: 'pr-reviewers-preferences',
  scope: 'device',
  version: 1,
  schema: PrReviewersSettingsSchema,
});
