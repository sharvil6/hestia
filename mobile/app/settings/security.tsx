import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import {
  authListSessions, authLogout, authRevokeSession, authMe,
} from '../../lib/api';
import { clearSession, getKeyWords } from '../../lib/auth';
import type { SessionInfo, User } from '@hestia/shared/types';

const QR_PREFIX = 'hestia://auth?w=';

export default function SecurityScreen() {
  const router = useRouter();
  const { data: user, isLoading: meLoading } = useQuery<User>({ queryKey: ['auth', 'me'], queryFn: authMe });

  return (
    <ScrollView className="flex-1 bg-cream" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl text-charcoal mb-1" style={{ fontFamily: 'serif' }}>Security</Text>
      <Text className="text-gray-500 mb-5">
        {meLoading ? ' ' : `Signed in as ${user?.display_name ?? '—'}.`}
      </Text>

      <KeySection />
      <SessionsSection />

      <TouchableOpacity
        onPress={async () => {
          try { await authLogout(); } catch { /* ignore */ }
          await clearSession();
          router.replace('/login');
        }}
        className="bg-white border border-red-200 rounded-lg py-3 items-center mt-2 mb-12"
      >
        <Text className="text-red-600 font-medium">Sign out this device</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function KeySection() {
  const [words, setWords] = useState<string[] | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => { getKeyWords().then(setWords); }, []);

  return (
    <Section title="Recovery key" subtitle="Your 12-word phrase. Show it to log in on another device.">
      {!words && (
        <Text className="text-gray-500 text-sm">
          This device doesn&apos;t have your key saved.
        </Text>
      )}
      {words && !show && (
        <TouchableOpacity onPress={() => setShow(true)} className="bg-cream border border-gray-200 rounded-lg py-2 px-3 self-start">
          <Text className="text-charcoal">Show my key</Text>
        </TouchableOpacity>
      )}
      {words && show && (
        <>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -4, marginBottom: 12 }}>
            {words.map((w, i) => (
              <View key={i} style={{ width: '33.333%', paddingHorizontal: 4, marginBottom: 8 }}>
                <View className="bg-cream rounded-lg px-2 pt-2 pb-1.5 items-center border border-gray-100">
                  <Text className="text-[10px] text-gray-400 self-start">{i + 1}</Text>
                  <Text className="text-charcoal" style={{ fontFamily: 'monospace' }}>{w}</Text>
                </View>
              </View>
            ))}
          </View>
          <View className="items-center my-2 p-3 bg-white">
            <QRCode value={QR_PREFIX + words.join('+')} size={200} />
          </View>
          <TouchableOpacity onPress={() => setShow(false)} className="self-start mt-3">
            <Text className="text-gray-500">Hide</Text>
          </TouchableOpacity>
        </>
      )}
    </Section>
  );
}

function SessionsSection() {
  const qc = useQueryClient();
  const { data: sessions, isLoading } = useQuery<SessionInfo[]>({
    queryKey: ['auth', 'sessions'], queryFn: authListSessions,
  });
  const revoke = useMutation({
    mutationFn: authRevokeSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });

  return (
    <Section title="Active sessions">
      {isLoading && <ActivityIndicator color="#CC5500" />}
      {sessions?.map((s) => (
        <View key={s.id_prefix} className="flex-row items-center justify-between py-2 border-b border-gray-100">
          <View className="flex-1 pr-2">
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <Text className="text-charcoal font-medium" numberOfLines={1}>
                {s.user_agent ? trimUA(s.user_agent) : 'Unknown device'}
              </Text>
              {s.current && (
                <Text className="text-[10px] text-ember bg-cream px-1.5 py-0.5 rounded">THIS DEVICE</Text>
              )}
            </View>
            <Text className="text-xs text-gray-400">Last seen {new Date(s.last_seen_at).toLocaleString()}</Text>
          </View>
          {!s.current && (
            <TouchableOpacity
              onPress={() => Alert.alert('Sign this device out?', '', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => revoke.mutate(s.id_prefix) },
              ])}
              className="px-2 py-1">
              <Text className="text-red-600 text-sm">Revoke</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </Section>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="text-base text-charcoal font-semibold mb-1" style={{ fontFamily: 'serif' }}>{title}</Text>
      {subtitle && <Text className="text-sm text-gray-500 mb-2">{subtitle}</Text>}
      <View className="bg-white border border-gray-200 rounded-xl p-3">
        {children}
      </View>
    </View>
  );
}

function trimUA(ua: string) {
  const m = ua.match(/\(([^)]+)\)/);
  return m ? m[1] : ua.slice(0, 50);
}
