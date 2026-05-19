import '../global.css';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function RootLayout() {
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
        <Stack.Screen name="login" options={{ title: 'Who is cooking?', presentation: 'modal' }} />
        <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
        <Stack.Screen
          name="add-recipe"
          options={{ title: 'Add Recipe', presentation: 'fullScreenModal' }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
