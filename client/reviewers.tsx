import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { PluginTheme } from '@getpaseo/plugin';
import { useRpc, type PluginWorkspacePanelProps } from '@getpaseo/plugin/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { loadReviewers, requestReviewers } from '../shared/reviewers';
import { openExternal } from './web';

const stateLabels: Record<string, string> = { APPROVED: 'Approved', CHANGES_REQUESTED: 'Changes requested', COMMENTED: 'Commented', DISMISSED: 'Review dismissed' };
const stateLabel = (state: string) => stateLabels[state] ?? state.toLowerCase().replace(/_/g, ' ');
const stateTone = (state: string): keyof PluginTheme['colors'] => state === 'APPROVED' ? 'statusSuccess' : state === 'CHANGES_REQUESTED' ? 'statusDanger' : 'foregroundMuted';

/** A disclosure section styled like the sections of Paseo's pull request panel. */
function Section({ title, open, onToggle, summary, theme, children }: { title: string; open: boolean; onToggle: () => void; summary?: ReactNode; theme: PluginTheme; children: ReactNode }) {
  const muted = theme.colors.foregroundMuted;
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Text style={{ color: muted, fontSize: 12, width: 12 }}>{open ? '▾' : '▸'}</Text>
      <Text style={{ color: muted, fontSize: 13, fontWeight: '500' }}>{title}</Text>
      <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>{summary}</View>
    </Pressable>
    {open && <View style={{ paddingBottom: 12 }}>{children}</View>}
  </View>;
}

export function ReviewersPanel(props: PluginWorkspacePanelProps) {
  return <Panel key={props.host.id + props.workspaceId} {...props} />;
}
function Panel({ workspaceId, theme }: PluginWorkspacePanelProps) {
  const load = useRpc(loadReviewers);
  const request = useRpc(requestReviewers);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState('');
  const [reviewersOpen, setReviewersOpen] = useState(true);
  const [requestOpen, setRequestOpen] = useState(true);
  const query = useQuery({ queryKey: ['pr-reviewers', workspaceId], queryFn: () => load({ workspaceId }), refetchOnWindowFocus: false });
  const data = query.data;
  const mutation = useMutation({ mutationFn: request, onSuccess: async () => {
    setSelected([]); setMessage('Review request verified on GitHub.'); await query.refetch();
  } });
  const busy = query.isFetching || mutation.isPending;
  const { colors } = theme;
  const text = { color: colors.foreground, fontSize: 14 };
  const muted = { color: colors.foregroundMuted, fontSize: 13 };
  const row = { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 32 } as const;
  const notice = { ...muted, paddingHorizontal: 12, paddingVertical: 4 };
  const selectedKeys = new Set(selected);
  const pendingUsers = new Set(data?.requested.users.map(u => u.login.toLowerCase()));
  const pendingTeams = new Set(data?.requested.teams.map(t => t.slug));
  const reviewedOnly = data?.reviews.filter(r => !pendingUsers.has(r.login.toLowerCase())) ?? [];
  const listed = new Set([...pendingUsers, ...reviewedOnly.map(r => r.login.toLowerCase())]);
  const choices = data ? [...data.people.filter(p => !listed.has(p.login.toLowerCase())).map(p => ({ key: `user:${p.login}`, label: p.login })), ...data.teams.filter(t => !pendingTeams.has(t.slug)).map(t => ({ key: `team:${t.slug}`, label: `${t.name} (team: ${t.slug})` }))] : [];
  const eligible = choices.filter(x => selectedKeys.has(x.key));
  const ready = !!data && data.pull.state === 'OPEN' && !data.pull.isDraft;
  const send = (users: string[], teams: string[]) => data && mutation.mutate({ workspaceId, pullUrl: data.pull.url, account: data.account, users, teams });
  const lastReview = new Map(data?.reviews.map(r => [r.login.toLowerCase(), r.state]));
  const reviewers = data ? [
    ...data.requested.users.map(u => ({ key: `user:${u.login}`, label: u.login, state: 'PENDING', status: `Awaiting review${lastReview.has(u.login.toLowerCase()) ? ` · previously ${stateLabel(lastReview.get(u.login.toLowerCase())!).toLowerCase()}` : ''}`, rerequest: false })),
    ...data.requested.teams.map(t => ({ key: `team:${t.slug}`, label: `${t.name} (team)`, state: 'PENDING', status: 'Awaiting review', rerequest: false })),
    ...reviewedOnly.map(r => ({ key: `user:${r.login}`, label: r.login, state: r.state, status: stateLabel(r.state), rerequest: true })),
  ] : [];
  const counts = (['APPROVED', 'CHANGES_REQUESTED', 'PENDING'] as const).map(state => ({ state, count: reviewers.filter(r => r.state === state).length })).filter(c => c.count > 0);
  return <ScrollView style={{ flex: 1, backgroundColor: colors.surface0 }} contentContainerStyle={{ paddingVertical: 8 }}>
    <View style={[row, { justifyContent: 'flex-end' }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh reviewers" disabled={busy} onPress={() => { setSelected([]); setMessage(''); mutation.reset(); void query.refetch(); }} style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, opacity: busy ? 0.5 : 1 }}><Text style={muted}>{query.isFetching ? 'Loading…' : '↻ Refresh'}</Text></Pressable>
    </View>
    {query.error && <Text accessibilityRole="alert" style={notice}>{query.error.message}</Text>}
    {data && <>
      <Pressable accessibilityRole="link" onPress={() => void openExternal(data.pull.url)} style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}>
        <Text style={[text, { fontSize: 15, fontWeight: '600' }]}>{data.pull.title} <Text style={{ color: colors.foregroundMuted, fontWeight: '400' }}>#{data.pull.number}</Text></Text>
        <Text style={muted}>Requests sent as {data.account}</Text>
      </Pressable>
      {!ready && <Text style={notice}>The pull request must be open and ready for review.</Text>}
      <Section title="Reviewers" open={reviewersOpen} onToggle={() => setReviewersOpen(o => !o)} theme={theme} summary={counts.map(c => <Text key={c.state} style={{ fontSize: 13, color: colors[stateTone(c.state)] }}>{c.count} {c.state === 'PENDING' ? 'awaiting' : stateLabel(c.state).toLowerCase()}</Text>)}>
        {reviewers.length === 0 && <Text style={notice}>No reviews or pending requests</Text>}
        {reviewers.map(r => <View key={r.key} style={row}>
          <Text style={[text, { flexShrink: 1 }]} numberOfLines={1}>{r.label}</Text>
          <Text style={{ fontSize: 13, color: colors[stateTone(r.state)], flexShrink: 1 }} numberOfLines={1}>{r.status}</Text>
          {r.rerequest && <Pressable accessibilityRole="button" accessibilityLabel={`Re-request review from ${r.label}`} disabled={busy || !ready} onPress={() => { setMessage(''); mutation.reset(); send([r.label], []); }} style={{ marginLeft: 'auto', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.border, opacity: busy || !ready ? 0.5 : 1 }}><Text style={muted}>Re-request</Text></Pressable>}
        </View>)}
      </Section>
      <Section title="Request review" open={requestOpen} onToggle={() => setRequestOpen(o => !o)} theme={theme} summary={eligible.length > 0 && <Text style={muted}>{eligible.length} selected</Text>}>
        {data.warnings.map(w => <Text key={w} style={notice}>{w}</Text>)}
        <TextInput accessibilityLabel="Filter reviewers" placeholder="Filter people or teams" placeholderTextColor={colors.foregroundMuted} value={filter} onChangeText={setFilter} style={[text, { marginHorizontal: 12, marginVertical: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }]} />
        {choices.filter(x => x.label.toLowerCase().includes(filter.toLowerCase())).map(x => <Pressable key={x.key} accessibilityRole="checkbox" accessibilityState={{ checked: selectedKeys.has(x.key), disabled: busy || !ready }} disabled={busy || !ready} onPress={() => { setMessage(''); mutation.reset(); setSelected(s => s.includes(x.key) ? s.filter(k => k !== x.key) : [...s, x.key]); }} style={row}><Text style={text}>{selectedKeys.has(x.key) ? '☑' : '☐'} {x.label}</Text></Pressable>)}
        {choices.length === 0 && <Text style={notice}>No selectable reviewers are available. Check repository access and the messages above.</Text>}
        <Pressable accessibilityRole="button" disabled={busy || !ready || eligible.length === 0 || !!query.error} onPress={() => send(eligible.filter(x => x.key.startsWith('user:')).map(x => x.key.slice(5)), eligible.filter(x => x.key.startsWith('team:')).map(x => x.key.slice(5)))} style={{ marginHorizontal: 12, marginTop: 8, paddingVertical: 8, borderRadius: 6, alignItems: 'center', backgroundColor: colors.accent, opacity: busy || !ready || !eligible.length ? 0.5 : 1 }}><Text style={{ color: colors.accentForeground, fontSize: 14 }}>{mutation.isPending ? 'Requesting…' : eligible.length ? `Request review (${eligible.length})` : 'Request review'}</Text></Pressable>
      </Section>
    </>}
    {mutation.error && <Text accessibilityRole="alert" style={notice}>{mutation.error.message}</Text>}
    {!!message && <Text accessibilityRole="alert" style={notice}>{message}</Text>}
  </ScrollView>;
}
