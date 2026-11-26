import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput } from 'react-native';
import { useRpc, type PluginWorkspacePanelProps } from '@getpaseo/plugin/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { loadReviewers, requestReviewers } from '../shared/reviewers';
import { openExternal } from './web';

export function ReviewersPanel(props: PluginWorkspacePanelProps) {
  return <Panel key={props.host.id + props.workspaceId} {...props} />;
}
function Panel({ workspaceId, theme }: PluginWorkspacePanelProps) {
  const load = useRpc(loadReviewers);
  const request = useRpc(requestReviewers);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState('');
  const query = useQuery({ queryKey: ['pr-reviewers', workspaceId], queryFn: () => load({ workspaceId }), refetchOnWindowFocus: false });
  const data = query.data;
  const mutation = useMutation({ mutationFn: request, onSuccess: async () => {
    setSelected([]); setMessage('Review request verified on GitHub.'); await query.refetch();
  } });
  const busy = query.isFetching || mutation.isPending;
  const text = { color: theme.colors.foreground };
  const button = { padding: 12, borderRadius: 6, backgroundColor: theme.colors.accent, marginVertical: 6 };
  const selectedKeys = new Set(selected);
  const pendingUsers = new Set(data?.requested.users.map(u => u.login));
  const pendingTeams = new Set(data?.requested.teams.map(t => t.slug));
  const choices = data ? [...data.people.map(p => ({ key: `user:${p.login}`, label: p.login, pending: pendingUsers.has(p.login) })), ...data.teams.map(t => ({ key: `team:${t.slug}`, label: `${t.name} (team: ${t.slug})`, pending: pendingTeams.has(t.slug) }))] : [];
  const eligible = choices.filter(x => !x.pending && selectedKeys.has(x.key));
  const ready = !!data && data.pull.state === 'OPEN' && !data.pull.isDraft;
  return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
    <Text style={[text, { fontSize: 20, fontWeight: '600' }]}>PR reviewers</Text>
    <Text style={text}>Choose people or teams, then request their review.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setSelected([]); setMessage(''); mutation.reset(); void query.refetch(); }} style={[button, { opacity: busy ? 0.5 : 1 }]}><Text style={{ color: theme.colors.accentForeground }}>{query.isFetching ? 'Loading…' : 'Refresh'}</Text></Pressable>
    {query.error && <Text accessibilityRole="alert" style={text}>{query.error.message}</Text>}
    {data && <>
      <Pressable accessibilityRole="link" onPress={() => void openExternal(data.pull.url)}><Text style={text}>#{data.pull.number} · {data.pull.title}</Text></Pressable>
      <Text style={text}>Requests sent as {data.account}</Text>
      <Text style={text}>Requested: {[...data.requested.users.map(u => u.login), ...data.requested.teams.map(t => `${t.name} (team)`)].join(', ') || 'No pending requests'}</Text>
      {!ready && <Text style={text}>The pull request must be open and ready for review.</Text>}
      {data.warnings.map(w => <Text key={w} style={text}>{w}</Text>)}
      <TextInput accessibilityLabel="Filter reviewers" placeholder="Filter people or teams" placeholderTextColor={theme.colors.foreground} value={filter} onChangeText={setFilter} style={[text, { borderWidth: 1, borderColor: theme.colors.foreground, borderRadius: 6, padding: 10 }]} />
      {choices.filter(x => x.label.toLowerCase().includes(filter.toLowerCase())).map(x => <Pressable key={x.key} accessibilityRole="checkbox" accessibilityState={{ checked: selectedKeys.has(x.key), disabled: busy || x.pending || !ready }} disabled={busy || x.pending || !ready} onPress={() => { setMessage(''); mutation.reset(); setSelected(s => s.includes(x.key) ? s.filter(k => k !== x.key) : [...s, x.key]); }} style={{ paddingVertical: 10, opacity: x.pending ? 0.6 : 1 }}><Text style={text}>{selectedKeys.has(x.key) ? '☑' : '☐'} {x.label}{x.pending ? ' · requested' : ''}</Text></Pressable>)}
      {choices.length === 0 && <Text style={text}>No selectable reviewers are available. Check repository access and the messages above.</Text>}
      <Text style={text}>{eligible.length} selected</Text>
      <Pressable accessibilityRole="button" disabled={busy || !ready || eligible.length === 0 || !!query.error} onPress={() => mutation.mutate({ workspaceId, pullUrl: data.pull.url, account: data.account, users: eligible.filter(x => x.key.startsWith('user:')).map(x => x.key.slice(5)), teams: eligible.filter(x => x.key.startsWith('team:')).map(x => x.key.slice(5)) })} style={[button, { opacity: busy || !ready || !eligible.length ? 0.5 : 1 }]}><Text style={{ color: theme.colors.accentForeground }}>{mutation.isPending ? 'Requesting…' : 'Request review'}</Text></Pressable>
    </>}
    {mutation.error && <Text accessibilityRole="alert" style={text}>{mutation.error.message}</Text>}
    {!!message && <Text accessibilityRole="alert" style={text}>{message}</Text>}
  </ScrollView>;
}
