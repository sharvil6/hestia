import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { authEnroll, authInviteInfo } from '../../lib/api';
import { saveSession, saveKeyWords } from '../../lib/auth';

export default function EnrollScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ words: string[]; qr: string } | null>(null);

  useEffect(() => {
    if (!code) return;
    authInviteInfo(code)
      .then((r: { display_name: string }) => setDisplayName(r.display_name))
      .catch((e: Error) => setLoadErr(e.message || 'Invite not found or expired'));
  }, [code]);

  async function onCreate() {
    if (!code) return;
    setBusy(true); setLoadErr(null);
    try {
      const r = await authEnroll(code);
      await saveSession(r.session_token, r.user);
      await saveKeyWords(r.key_words);
      setResult({ words: r.key_words, qr: r.key_qr_payload });
    } catch (e) {
      setLoadErr((e as Error).message || 'Enrollment failed');
    } finally { setBusy(false); }
  }

  return (
    <ScrollView className="flex-1 bg-cream" contentContainerStyle={{ padding: 24 }}>
      <Text className="text-2xl text-ember mb-1 text-center" style={{ fontFamily: 'serif' }}>
        {result ? 'Save your key.' : displayName ? `Welcome, ${displayName}.` : 'Welcome.'}
      </Text>
      {!result && (
        <Text className="text-gray-500 mb-6 text-center">
          Tap below to set up this device for Hestia.
        </Text>
      )}

      <View className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        {loadErr && !result && (
          <Text className="text-red-600 text-sm">{loadErr}</Text>
        )}
        {!loadErr && !result && (
          <>
            <Text className="text-sm text-gray-500 mb-4">
              You&apos;re about to create a new account on this device. We&apos;ll show you a 12-word recovery key — write it down somewhere safe, since it&apos;s the only way to sign in on another device.
            </Text>
            <TouchableOpacity disabled={busy || !displayName} onPress={onCreate}
              className="bg-ember rounded-lg py-3 items-center"
              style={{ opacity: busy || !displayName ? 0.5 : 1 }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-medium">Create my key</Text>}
            </TouchableOpacity>
          </>
        )}
        {result && (
          <>
            <Text className="text-sm text-gray-500 mb-3">
              Write these down. Anyone with them can sign in as you.
            </Text>
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -4, marginBottom: 12 }}>
              {result.words.map((w, i) => (
                <View key={i} style={{ width: '33.333%', paddingHorizontal: 4, marginBottom: 8 }}>
                  <View className="bg-gray-50 rounded-lg px-2 pt-2 pb-1.5 items-center">
                    <Text className="text-[10px] text-gray-400 self-start">{i + 1}</Text>
                    <Text className="text-charcoal" style={{ fontFamily: 'monospace' }}>{w}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View className="items-center my-2 p-3 bg-white">
              <QRCode value={result.qr} size={200} />
            </View>
            <TouchableOpacity onPress={() => router.replace('/')} className="bg-ember rounded-lg py-3 items-center mt-3">
              <Text className="text-white font-medium">I&apos;ve saved my key — continue</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}
