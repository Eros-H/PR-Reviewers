import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { PluginTheme } from '@getpaseo/plugin';
import { useRpc, useWorkspace, type PluginWorkspacePanelProps } from '@getpaseo/plugin/client';
import { Icon } from '@getpaseo/plugin/client/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { loadCandidates, loadStatus, requestReviewers } from '../shared/reviewers';
import { openExternal } from './web';

/** How often the panel reads review state from GitHub while it is shown. */
const STATUS_POLL_MS = 30_000;
/** Collaborators and teams change rarely; re-read them on focus once this old. */
const CANDIDATES_STALE_MS = 5 * 60_000;

type Tone = 'statusSuccess' | 'statusWarning' | 'statusDanger' | 'foregroundMuted';
/** GitHub's reviewer sidebar marks: an icon and colour per review state. */
const states: Record<string, { label: string; icon: string; tone: Tone }> = {
  PENDING: { label: 'Awaiting review', icon: '', tone: 'statusWarning' },
  APPROVED: { label: 'Approved', icon: 'Check', tone: 'statusSuccess' },
  CHANGES_REQUESTED: { label: 'Changes requested', icon: 'FileDiff', tone: 'statusDanger' },
  COMMENTED: { label: 'Commented', icon: 'MessageSquare', tone: 'foregroundMuted' },
  DISMISSED: { label: 'Review dismissed', icon: 'CircleSlash', tone: 'foregroundMuted' },
};
const stateOf = (state: string) => states[state] ?? { label: state.toLowerCase().replace(/_/g, ' '), icon: 'Circle', tone: 'foregroundMuted' as const };
const pullStates: Record<string, { label: string; icon: string; tone: Tone | 'accent' }> = {
  OPEN: { label: 'Open', icon: 'GitPullRequest', tone: 'statusSuccess' },
  DRAFT: { label: 'Draft', icon: 'GitPullRequestDraft', tone: 'foregroundMuted' },
  MERGED: { label: 'Merged', icon: 'GitMerge', tone: 'accent' },
  CLOSED: { label: 'Closed', icon: 'GitPullRequestClosed', tone: 'statusDanger' },
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Avatar({ login, size, theme }: { login: string; size: number; theme: PluginTheme }) {
  const [failed, setFailed] = useState(false);
  const shape = { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.surface2 };
  if (failed) return <View style={[shape, { alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: theme.colors.foregroundMuted, fontSize: size * 0.5 }}>{login.slice(0, 1).toUpperCase()}</Text></View>;
  return <Image source={{ uri: `https://avatars.githubusercontent.com/${encodeURIComponent(login)}?s=${size * 2}` }} onError={() => setFailed(true)} style={shape} />;
}
/** GitHub marks an awaited review with a solid dot; Lucide's Dot is too small to read. */
function StateMark({ state, size, theme }: { state: string; size: number; theme: PluginTheme }) {
  const s = stateOf(state);
  if (state === 'PENDING') return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: size / 2, height: size / 2, borderRadius: size / 4, backgroundColor: theme.colors[s.tone] }} /></View>;
  return <Icon name={s.icon} size={size} color={theme.colors[s.tone]} />;
}
function TeamAvatar({ size, theme }: { size: number; theme: PluginTheme }) {
  return <View style={{ width: size, height: size, borderRadius: 4, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
    <Icon name="Users" size={size * 0.65} color={theme.colors.foregroundMuted} />
  </View>;
}

/** A disclosure section styled like the sections of Paseo's pull request panel. */
function Section({ title, open, onToggle, summary, theme, children }: { title: string; open: boolean; onToggle: () => void; summary?: ReactNode; theme: PluginTheme; children: ReactNode }) {
  const muted = theme.colors.foregroundMuted;
  return <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10 }}>
      <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={14} color={muted} />
      <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: '600' }}>{title}</Text>
      <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 10 }}>{summary}</View>
    </Pressable>
    {open && <View style={{ paddingBottom: 12 }}>{children}</View>}
  </View>;
}

export function ReviewersPanel(props: PluginWorkspacePanelProps) {
  // A branch switch can point the workspace at another pull request: start over with fresh state.
  const branch = useWorkspace(props.workspaceId, w => w.branch);
  return <Panel key={`${props.host.id}:${props.workspaceId}:${branch ?? ''}`} branch={branch} {...props} />;
}
function Panel({ workspaceId, theme, branch }: PluginWorkspacePanelProps & { branch: string | null }) {
  const loadState = useRpc(loadStatus);
  const loadPeople = useRpc(loadCandidates);
  const request = useRpc(requestReviewers);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [filterFocused, setFilterFocused] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewersOpen, setReviewersOpen] = useState(true);
  const [requestOpen, setRequestOpen] = useState(true);
  const statusQuery = useQuery({ queryKey: ['pr-reviewers', 'status', workspaceId, branch], queryFn: () => loadState({ workspaceId }), refetchInterval: STATUS_POLL_MS });
  const candidatesQuery = useQuery({ queryKey: ['pr-reviewers', 'candidates', workspaceId, branch], queryFn: () => loadPeople({ workspaceId }), enabled: Boolean(statusQuery.data), staleTime: CANDIDATES_STALE_MS });
  const data = statusQuery.data;
  const pool = candidatesQuery.data;
  const noPullRequest = Boolean(statusQuery.error && /no pull requests? found/i.test(statusQuery.error.message));
  const mutation = useMutation({
    mutationFn: request,
    onSuccess: async (_result, input) => {
      setSelected([]);
      setMessage(`Review requested from ${[...input.users, ...input.teams].join(', ')}.`);
      await statusQuery.refetch();
    },
    // The server refuses when the pull request or account moved on; show the current state.
    onError: () => { void statusQuery.refetch(); },
  });
  const busy = mutation.isPending;
  const { colors } = theme;
  const text = { color: colors.foreground, fontSize: 14 };
  const muted = { color: colors.foregroundMuted, fontSize: 13 };
  const row = { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 34 } as const;
  const notice = { ...muted, paddingHorizontal: 12, paddingVertical: 4 };
  const clearFeedback = () => { setMessage(''); mutation.reset(); };

  const selectedKeys = new Set(selected);
  const pendingUsers = new Set(data?.requested.users.map(u => u.login.toLowerCase()));
  const pendingTeams = new Set(data?.requested.teams.map(t => t.slug));
  const reviewedOnly = data?.reviews.filter(r => !pendingUsers.has(r.login.toLowerCase())) ?? [];
  const listed = new Set([...pendingUsers, ...reviewedOnly.map(r => r.login.toLowerCase())]);
  const choices = pool ? [
    ...pool.people.filter(p => !listed.has(p.login.toLowerCase())).map(p => ({ key: `user:${p.login}`, label: p.login, detail: '', team: false })),
    ...pool.teams.filter(t => !pendingTeams.has(t.slug)).map(t => ({ key: `team:${t.slug}`, label: t.name, detail: t.slug, team: true })),
  ] : [];
  const eligible = choices.filter(x => selectedKeys.has(x.key));
  const visible = choices.filter(x => `${x.label} ${x.detail}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const ready = !!data && data.pull.state === 'OPEN' && !data.pull.isDraft;
  const send = (users: string[], teams: string[]) => { if (data) { clearFeedback(); mutation.mutate({ workspaceId, pullUrl: data.pull.url, account: data.account, users, teams }); } };
  const sending = (login: string) => busy && !!mutation.variables?.users.includes(login);

  const lastReview = new Map(data?.reviews.map(r => [r.login.toLowerCase(), r.state]));
  const reviewers = data ? [
    ...data.requested.users.map(u => {
      const before = lastReview.get(u.login.toLowerCase());
      return { key: `user:${u.login}`, login: u.login, team: false, state: 'PENDING', note: before ? `previously ${stateOf(before).label.toLowerCase()}` : '', rerequest: false };
    }),
    ...data.requested.teams.map(t => ({ key: `team:${t.slug}`, login: t.name, team: true, state: 'PENDING', note: 'team', rerequest: false })),
    ...reviewedOnly.map(r => ({ key: `user:${r.login}`, login: r.login, team: false, state: r.state, note: '', rerequest: true })),
  ] : [];
  const counts = (['APPROVED', 'CHANGES_REQUESTED', 'PENDING'] as const).map(state => ({ state, count: reviewers.filter(r => r.state === state).length })).filter(c => c.count > 0);
  const approvals = reviewers.filter(r => r.state === 'APPROVED').length;
  const blocking = reviewers.filter(r => r.state === 'CHANGES_REQUESTED').length;
  const decision = data && ({
    APPROVED: { icon: 'CircleCheck', tone: 'statusSuccess', title: 'Changes approved', detail: `${plural(approvals, 'approving review')}.` },
    CHANGES_REQUESTED: { icon: 'CircleX', tone: 'statusDanger', title: 'Changes requested', detail: `${plural(blocking, 'review')} requesting changes.` },
    REVIEW_REQUIRED: { icon: 'CircleDot', tone: 'statusWarning', title: 'Review required', detail: 'An approving review is required before merging.' },
  } as const)[data.pull.reviewDecision as 'APPROVED'];
  const pullState = data && pullStates[data.pull.isDraft && data.pull.state === 'OPEN' ? 'DRAFT' : data.pull.state];
  const pullTone = pullState && (pullState.tone === 'accent' ? colors.accent : colors[pullState.tone]);

  return <ScrollView style={{ flex: 1, backgroundColor: colors.surface0 }} contentContainerStyle={{ paddingVertical: 8 }}>
    {statusQuery.isLoading && <View style={[row, { justifyContent: 'center', paddingVertical: 16 }]}><ActivityIndicator size="small" color={colors.foregroundMuted} /><Text style={muted}>Loading reviewers…</Text></View>}
    {noPullRequest && <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 32, gap: 8 }}>
      <Icon name="GitPullRequest" size={20} color={colors.foregroundMuted} />
      <Text style={[text, { fontWeight: '500', textAlign: 'center' }]}>No pull request for this branch</Text>
      <Text style={[muted, { textAlign: 'center' }]}>Reviewers will appear here automatically once a pull request is opened.</Text>
    </View>}
    {statusQuery.error && !noPullRequest && <Text accessibilityRole="alert" style={notice}>{statusQuery.error.message}</Text>}
    {data && <>
      <Pressable accessibilityRole="link" onPress={() => void openExternal(data.pull.url)} style={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 10, gap: 6 }}>
        <Text style={[text, { fontSize: 15, fontWeight: '600' }]}>{data.pull.title} <Text style={{ color: colors.foregroundMuted, fontWeight: '400' }}>#{data.pull.number}</Text></Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {pullState && pullTone && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: pullTone }}>
            <Icon name={pullState.icon} size={12} color={colors.surface0} />
            <Text style={{ color: colors.surface0, fontSize: 12, fontWeight: '600' }}>{pullState.label}</Text>
          </View>}
          <Avatar login={data.account} size={16} theme={theme} />
          <Text style={muted}>Requesting as {data.account}</Text>
        </View>
      </Pressable>
      {!ready && <Text style={notice}>The pull request must be open and ready for review.</Text>}
      {decision && <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 12, marginBottom: 10, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 }}>
        <Icon name={decision.icon} size={18} color={colors[decision.tone]} />
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text style={[text, { fontWeight: '600' }]}>{decision.title}</Text>
          <Text style={muted}>{decision.detail}</Text>
        </View>
      </View>}
      {mutation.error && <Text accessibilityRole="alert" style={[notice, { color: colors.statusDanger }]}>{mutation.error.message}</Text>}
      {!!message && <Text accessibilityRole="alert" style={[notice, { color: colors.statusSuccess }]}>{message}</Text>}

      <Section title="Reviewers" open={reviewersOpen} onToggle={() => setReviewersOpen(o => !o)} theme={theme} summary={counts.map(c => <View key={c.state} accessibilityLabel={`${c.count} ${stateOf(c.state).label.toLowerCase()}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <StateMark state={c.state} size={14} theme={theme} />
        <Text style={{ fontSize: 12, color: colors[stateOf(c.state).tone] }}>{c.count}</Text>
      </View>)}>
        {reviewers.length === 0 && <Text style={notice}>No reviews yet. Request one below.</Text>}
        {reviewers.map(r => {
          const s = stateOf(r.state);
          return <View key={r.key} style={row}>
            {r.team ? <TeamAvatar size={20} theme={theme} /> : <Avatar login={r.login} size={20} theme={theme} />}
            <View style={{ flexShrink: 1, flexGrow: 1 }}>
              <Text style={[text, { fontWeight: '500' }]} numberOfLines={1}>{r.login}</Text>
              {!!r.note && <Text style={{ color: colors.foregroundMuted, fontSize: 12 }} numberOfLines={1}>{r.note}</Text>}
            </View>
            {r.rerequest && (sending(r.login)
              ? <ActivityIndicator size="small" color={colors.foregroundMuted} />
              : <Pressable accessibilityRole="button" accessibilityLabel={`Re-request review from ${r.login}`} disabled={busy || !ready} onPress={() => send([r.login], [])} hitSlop={6} style={{ padding: 4, borderRadius: 6, opacity: busy || !ready ? 0.4 : 1 }}>
                <Icon name="RefreshCw" size={14} color={colors.foregroundMuted} />
              </Pressable>)}
            <View accessibilityLabel={`${r.login}: ${s.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <StateMark state={r.state} size={16} theme={theme} />
              <Text style={{ fontSize: 12, color: colors[s.tone] }}>{r.state === 'PENDING' ? 'Awaiting' : s.label}</Text>
            </View>
          </View>;
        })}
      </Section>

      <Section title="Request review" open={requestOpen} onToggle={() => setRequestOpen(o => !o)} theme={theme} summary={eligible.length > 0 && <Text style={{ color: colors.accent, fontSize: 12 }}>{eligible.length} selected</Text>}>
        {pool?.warnings.map(w => <Text key={w} style={notice}>{w}</Text>)}
        {candidatesQuery.error && <Text accessibilityRole="alert" style={notice}>{candidatesQuery.error.message}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginVertical: 4, borderWidth: 1, borderColor: filterFocused ? colors.accent : colors.border, borderRadius: 6, paddingHorizontal: 8, backgroundColor: colors.surface1 }}>
          <Icon name="Search" size={14} color={colors.foregroundMuted} />
          <TextInput accessibilityLabel="Filter reviewers" placeholder="Type or choose a user or team" placeholderTextColor={colors.foregroundMuted} value={filter} onChangeText={setFilter} onFocus={() => setFilterFocused(true)} onBlur={() => setFilterFocused(false)} style={[text, { flex: 1, paddingVertical: 6, outlineWidth: 0 }]} />
        </View>
        <Pressable accessibilityRole="button" disabled={busy || !ready || eligible.length === 0} onPress={() => send(eligible.filter(x => !x.team).map(x => x.key.slice(5)), eligible.filter(x => x.team).map(x => x.key.slice(5)))} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginHorizontal: 12, marginTop: 4, marginBottom: 8, paddingVertical: 8, borderRadius: 6, backgroundColor: colors.accent, opacity: busy || !ready || !eligible.length ? 0.5 : 1 }}>
          {busy && !reviewedOnly.some(r => sending(r.login)) ? <ActivityIndicator size="small" color={colors.accentForeground} /> : <Icon name="UserPlus" size={14} color={colors.accentForeground} />}
          <Text style={{ color: colors.accentForeground, fontSize: 14, fontWeight: '500' }}>{eligible.length ? `Request review from ${plural(eligible.length, 'reviewer')}` : 'Select reviewers to request'}</Text>
        </Pressable>
        {candidatesQuery.isLoading && <View style={[row, { justifyContent: 'center' }]}><ActivityIndicator size="small" color={colors.foregroundMuted} /></View>}
        {visible.map(x => {
          const on = selectedKeys.has(x.key);
          return <Pressable key={x.key} accessibilityRole="checkbox" accessibilityLabel={x.team ? `${x.label} (team ${x.detail})` : x.label} accessibilityState={{ checked: on, disabled: busy || !ready }} disabled={busy || !ready} onPress={() => { clearFeedback(); setSelected(s => s.includes(x.key) ? s.filter(k => k !== x.key) : [...s, x.key]); }} style={[row, on && { backgroundColor: colors.surface1 }]}>
            <View style={{ width: 16, alignItems: 'center' }}>{on && <Icon name="Check" size={16} color={colors.accent} />}</View>
            {x.team ? <TeamAvatar size={20} theme={theme} /> : <Avatar login={x.label} size={20} theme={theme} />}
            <Text style={[text, { flexShrink: 1, fontWeight: on ? '600' : '400' }]} numberOfLines={1}>{x.label}</Text>
            {x.team && <Text style={{ color: colors.foregroundMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{x.detail}</Text>}
          </Pressable>;
        })}
        {pool && choices.length === 0 && <Text style={notice}>No one else can be requested. Check repository access and the messages above.</Text>}
        {pool && choices.length > 0 && visible.length === 0 && <Text style={notice}>No people or teams match “{filter.trim()}”.</Text>}
      </Section>
    </>}
  </ScrollView>;
}
