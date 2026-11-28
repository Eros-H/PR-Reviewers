import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import {
  useSettings,
  type PluginButtonIconProps,
  type PluginButtonRegistration,
  type PluginClientContext,
} from '@getpaseo/plugin/client';
import { Icon } from '@getpaseo/plugin/client/ui';
import { prReviewersSettings } from '../shared/settings';

interface DomRectLike {
  width: number;
  height: number;
}

interface MaybeDomNode {
  getBoundingClientRect?: () => DomRectLike;
}

export function workspaceHasPullRequest(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const ws = raw as {
    githubRuntime?: {
      pullRequest?: { number?: unknown; url?: unknown } | null;
    } | null;
  };
  const pr = ws.githubRuntime?.pullRequest;
  return Boolean(pr && typeof pr.number === 'number' && typeof pr.url === 'string');
}

function isNodeVisibleOnScreen(node: View | null): boolean {
  if (Platform.OS !== 'web') return true;
  const rect = (node as unknown as MaybeDomNode | null)?.getBoundingClientRect?.();
  if (!rect) return false;
  return rect.width > 0 && rect.height > 0;
}

/**
 * Watches Paseo's workspace directory for live `githubRuntime.pullRequest` presence:
 * - Shows a Reviewers button in the workspace header ONLY on workspaces that have a PR.
 * - Auto-opens the Reviewers panel in the right Explorer sidebar once per PR workspace,
 *   guarded so retained background workspaces never steal focus or navigate away.
 */
export function startPrReviewersWatcher(client: PluginClientContext): () => void {
  let disposed = false;
  let releaseSub: (() => Promise<void>) | null = null;
  const buttonsByWorkspace = new Map<string, PluginButtonRegistration>();
  const triggeredInSession = new Set<string>();

  function ReviewersHeaderIcon(props: PluginButtonIconProps) {
    const settings = useSettings(prReviewersSettings);
    const nodeRef = useRef<View | null>(null);
    const workspaceId = props.workspaceId;

    useEffect(() => {
      if (disposed || settings.status !== 'ready') return;
      if (!settings.values.autoOpenOnPr) return;
      if (triggeredInSession.has(workspaceId)) return;
      if (settings.values.autoOpenedWorkspaces.includes(workspaceId)) {
        triggeredInSession.add(workspaceId);
        return;
      }

      // Check visibility on the next frame (and re-check briefly in case the workspace tab
      // transitions from retained-hidden to active-visible without remounting).
      const tryAutoOpen = () => {
        if (disposed || triggeredInSession.has(workspaceId)) return true;
        if (!isNodeVisibleOnScreen(nodeRef.current)) return false;

        triggeredInSession.add(workspaceId);
        const nextOpened = [...settings.values.autoOpenedWorkspaces, workspaceId];
        void settings.save({ ...settings.values, autoOpenedWorkspaces: nextOpened }, settings.revision);
        try {
          client.openPanel('reviewers', { workspaceId, location: 'explorer' });
        } catch {
          // Explorer may be unavailable on compact layouts; keep the header button usable.
        }
        return true;
      };

      if (tryAutoOpen()) return;

      const intervalId = setInterval(() => {
        if (tryAutoOpen()) clearInterval(intervalId);
      }, 600);

      return () => clearInterval(intervalId);
    }, [settings, workspaceId]);

    return (
      <View ref={nodeRef} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="Users" size={props.size ?? 16} color={props.color} />
      </View>
    );
  }

  const syncWorkspace = (workspaceId: string, hasPr: boolean) => {
    if (disposed) return;
    const existing = buttonsByWorkspace.get(workspaceId);
    if (hasPr && !existing) {
      const reg = client.addHeaderButton({
        id: `pr-reviewers-${workspaceId}`,
        workspaceId,
        button: {
          title: 'Reviewers',
          icon: ReviewersHeaderIcon,
          behavior: {
            kind: 'action',
            onPress: () => {
              try {
                client.openPanel('reviewers', { workspaceId, location: 'explorer' });
              } catch {
                client.openPanel('reviewers', { workspaceId, location: 'workspace' });
              }
            },
          },
        },
      });
      buttonsByWorkspace.set(workspaceId, reg);
    } else if (!hasPr && existing) {
      existing.remove();
      buttonsByWorkspace.delete(workspaceId);
    }
  };

  const applySnapshot = (entries: readonly unknown[]) => {
    if (disposed) return;
    const seenWithPr = new Set<string>();
    for (const raw of entries) {
      if (!raw || typeof raw !== 'object') continue;
      const id = (raw as { id?: unknown }).id;
      if (typeof id !== 'string') continue;
      const hasPr = workspaceHasPullRequest(raw);
      if (hasPr) seenWithPr.add(id);
      syncWorkspace(id, hasPr);
    }
    for (const id of [...buttonsByWorkspace.keys()]) {
      if (!seenWithPr.has(id)) syncWorkspace(id, false);
    }
  };

  void (async () => {
    try {
      const result = await client.paseo.workspaces.list({ subscribe: {}, page: { limit: 200 } });
      if (disposed) {
        await result.subscription?.release().catch(() => undefined);
        return;
      }
      applySnapshot(result.entries);
      if (result.subscription) {
        releaseSub = () => result.subscription!.release();
        result.subscription.subscribe({
          snapshot: ({ entries }) => applySnapshot(entries),
          update: (msg) => {
            if (disposed || msg.type !== 'workspace_update') return;
            const payload = msg.payload as {
              kind?: string;
              workspace?: { id?: string };
              workspaceId?: string;
            };
            if (payload.kind === 'upsert' && payload.workspace?.id) {
              syncWorkspace(payload.workspace.id, workspaceHasPullRequest(payload.workspace));
            } else if (payload.kind === 'remove' && payload.workspaceId) {
              syncWorkspace(payload.workspaceId, false);
            }
          },
        });
      }
    } catch {
      // Older host or subscription unavailable: panel still works manually.
    }
  })();

  return () => {
    disposed = true;
    for (const reg of buttonsByWorkspace.values()) reg.remove();
    buttonsByWorkspace.clear();
    if (releaseSub) void releaseSub().catch(() => undefined);
  };
}
