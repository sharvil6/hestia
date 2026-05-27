import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  authLoginWithQr, authLoginWithWords,
} from '../lib/api';
import { saveSession, saveKeyWords } from '../lib/auth';

type Tab = 'words' | 'qr';

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const [tab, setTab] = useState<Tab>('words');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onWordsSubmit(words: string[]) {
    setBusy(true); setError(null);
    try {
      const r = await authLoginWithWords(words);
      await saveSession(r.session_token, r.user);
      await saveKeyWords(words);
      router.replace((params.next as string) || '/');
    } catch (e) {
      setError((e as Error).message || 'Login failed');
    } finally { setBusy(false); }
  }

  async function onQrScan(payload: string) {
    setBusy(true); setError(null);
    try {
      const r = await authLoginWithQr(payload);
      const words = payload.replace('hestia://auth?w=', '').split('+');
      await saveSession(r.session_token, r.user);
      if (words.length === 12) await saveKeyWords(words);
      router.replace((params.next as string) || '/');
    } catch (e) {
      setError((e as Error).message || 'QR sign-in failed');
    } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-cream"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text className="text-3xl text-ember mb-1 text-center" style={{ fontFamily: 'serif' }}>
          Welcome home.
        </Text>
        <Text className="text-gray-500 mb-6 text-center text-base">Sign in to your Hestia.</Text>

        <View className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <Tabs current={tab} onChange={setTab} />
          {tab === 'words' && <WordsPanel busy={busy} onSubmit={onWordsSubmit} />}
          {tab === 'qr' && <QrPanel busy={busy} onSubmit={onQrScan} />}
          {error && (
            <Text className="text-red-600 text-sm mt-3">{error}</Text>
          )}
        </View>

        <Text className="text-xs text-gray-400 text-center mt-6">
          New to Hestia? Ask the admin in your household for an invite link.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Tabs({ current, onChange }: { current: Tab; onChange: (t: Tab) => void }) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'words', label: 'Words' },
    { id: 'qr',    label: 'Scan QR' },
  ];
  return (
    <View className="flex-row mb-4 border-b border-gray-100">
      {tabs.map((t) => {
        const active = current === t.id;
        return (
          <TouchableOpacity key={t.id} onPress={() => onChange(t.id)} className="flex-1 py-2 items-center"
            style={{
              borderBottomWidth: 2,
              borderBottomColor: active ? '#CC5500' : 'transparent',
              marginBottom: -1,
            }}>
            <Text className={active ? 'text-charcoal font-medium' : 'text-gray-500'}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function WordsPanel({ busy, onSubmit }: { busy: boolean; onSubmit: (w: string[]) => void }) {
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const inputs = useRef<Array<TextInput | null>>([]);
  const filled = words.filter(Boolean).length;
  const valid = filled === 12;

  function setWord(i: number, v: string) {
    setWords((prev) => {
      // Handle paste-of-all-12 into any single input.
      const trimmed = v.trim().toLowerCase();
      const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
      if (tokens.length >= 12) {
        const next = tokens.slice(0, 12);
        // Move focus to the last input
        setTimeout(() => inputs.current[11]?.focus(), 0);
        return next;
      }
      const next = [...prev];
      next[i] = trimmed;
      return next;
    });
  }

  return (
    <View>
      <Text className="text-sm text-gray-500 mb-3">
        Enter your 12-word key.
      </Text>
      <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
        {words.map((w, i) => (
          <View key={i} style={{ width: '33.333%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View className="bg-gray-50 border border-gray-200 rounded-lg px-2 pt-3 pb-1.5">
              <Text className="text-[10px] text-gray-400">{i + 1}</Text>
              <TextInput
                ref={(el) => { inputs.current[i] = el; }}
                value={w}
                onChangeText={(v) => setWord(i, v)}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType={i === 11 ? 'done' : 'next'}
                onSubmitEditing={() => {
                  if (i < 11) inputs.current[i + 1]?.focus();
                  else if (valid) onSubmit(words);
                }}
                className="text-charcoal py-0.5"
                style={{ fontSize: 14, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) }}
              />
            </View>
          </View>
        ))}
      </View>
      <TouchableOpacity
        disabled={!valid || busy}
        onPress={() => onSubmit(words)}
        className="bg-ember rounded-lg py-3 items-center mt-2"
        style={{ opacity: valid && !busy ? 1 : 0.5 }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : (
          <Text className="text-white font-medium">{valid ? 'Sign in' : `${filled}/12 words`}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function QrPanel({ busy, onSubmit }: { busy: boolean; onSubmit: (payload: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const handled = useRef(false);

  useEffect(() => { handled.current = false; }, [scanning]);

  if (!permission) return <ActivityIndicator />;
  if (!permission.granted) {
    return (
      <View>
        <Text className="text-sm text-gray-500 mb-3">
          We need camera access to scan the QR from your other device.
        </Text>
        <TouchableOpacity onPress={requestPermission} className="bg-ember rounded-lg py-3 items-center">
          <Text className="text-white font-medium">Grant camera access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <Text className="text-sm text-gray-500 mb-3">
        Open <Text className="font-medium">Settings → Security → Show my key</Text> on a signed-in device and aim the camera at the QR.
      </Text>
      {!scanning && (
        <TouchableOpacity onPress={() => setScanning(true)} className="bg-ember rounded-lg py-3 items-center">
          <Text className="text-white font-medium">Start camera</Text>
        </TouchableOpacity>
      )}
      {scanning && (
        <View style={{ height: 280, borderRadius: 12, overflow: 'hidden' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(r) => {
              if (handled.current) return;
              if (!r.data?.startsWith('hestia://auth?w=')) return;
              handled.current = true;
              setScanning(false);
              onSubmit(r.data);
            }}
          />
        </View>
      )}
      {busy && <ActivityIndicator color="#CC5500" className="mt-3" />}
    </View>
  );
}
