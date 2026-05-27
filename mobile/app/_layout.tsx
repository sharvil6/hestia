import '../global.css';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { hydrateAuthCache } from '../lib/auth';

const queryClient = new QueryClient();

export default function RootLayout() {
  // Block first render until SecureStore's session token is loaded into the
  // synchronous cache. Otherwise the first API call from a child screen would
  // fire before getAuthToken() can answer, and we'd 401 ourselves.
  const [ready, setReady] = useState(false);
  useEffect(() => { hydrateAuthCache().finally(() => setReady(true)); }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDFBF7' }}>
        <ActivityIndicator color="#CC5500" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#FDFBF7' },
          headerTintColor: '#CC5500',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#FDFBF7' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Hestia' }} />
        <Stack.Screen name="login" options={{ title: 'Sign in', headerBackVisible: false }} />
        <Stack.Screen name="enroll/[code]" options={{ title: 'Set up Hestia', headerBackVisible: false }} />
        <Stack.Screen name="settings/security" options={{ title: 'Security' }} />
        <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
        <Stack.Screen
          name="add-recipe"
          options={{ title: 'Add Recipe', presentation: 'fullScreenModal' }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
