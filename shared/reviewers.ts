import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

export const person = z.object({ login: z.string() });
export const team = z.object({ slug: z.string(), name: z.string() });
export const requested = z.object({ users: z.array(person), teams: z.array(team) });
export const pull = z.object({ number: z.number(), title: z.string(), url: z.string(), state: z.string(), isDraft: z.boolean(), author: person });
/** A reviewer's latest submitted review. GitHub drops a reviewer from requested_reviewers once they submit one. */
export const review = z.object({ login: z.string(), state: z.string() });
export const snapshot = z.object({ account: z.string(), pull, requested, reviews: z.array(review), people: z.array(person), teams: z.array(team), warnings: z.array(z.string()) });
const workspace = z.object({ workspaceId: z.string().min(1) });
export const loadReviewers = defineRpc({ name: 'reviewers.load', input: workspace, output: snapshot });
export const requestReviewers = defineRpc({ name: 'reviewers.request', input: workspace.extend({
  pullUrl: z.string().url(), account: z.string().min(1),
  users: z.array(z.string().regex(/^[a-zA-Z0-9-]+$/)),
  teams: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)),
}).refine(x => x.users.length + x.teams.length > 0, 'Select at least one reviewer'), output: requested });
