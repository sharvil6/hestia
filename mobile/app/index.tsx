import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouter, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { getRecipes, searchRecipes } from '../lib/api';
import { getCachedToken } from '../lib/auth';
import type { Recipe } from '@hestia/shared/types';

export default function Home() {
  const router = useRouter();
  const navigation = useNavigation();
  const [search, setSearch] = useState('');

  // Boot guard: if we have no session token, route straight to /login so the
  // first /recipes/ call doesn't 401.
  useEffect(() => {
    if (!getCachedToken()) router.replace('/login');
  }, [router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => router.push('/settings/security')} className="mr-2">
          <Text className="text-ember font-medium text-sm">Account</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, router]);

  const { data: recipes, isLoading, refetch, isFetching } = useQuery<Recipe[]>({
    queryKey: search.trim() ? ['recipes', 'search', search] : ['recipes'],
    queryFn: () => (search.trim() ? searchRecipes(search) : getRecipes()),
    enabled: !!getCachedToken(),
  });

  const handleSearch = useCallback((text: string) => {
    setSearch(text);
  }, []);

  return (
    <View className="flex-1 bg-cream px-4 pt-4">
      <TextInput
        placeholder="Search family recipes..."
        value={search}
        onChangeText={handleSearch}
        returnKeyType="search"
        clearButtonMode="while-editing"
        className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 text-base text-charcoal"
        placeholderTextColor="#9ca3af"
      />

      {isLoading ? (
        <ActivityIndicator color="#CC5500" size="large" className="mt-12" />
      ) : (
        <FlatList
          data={recipes ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor="#CC5500" />
          }
          renderItem={({ item }) => (
            <Link href={`/recipe/${item.id}`} asChild>
              <TouchableOpacity className="bg-white p-4 rounded-xl border border-gray-100 mb-3 active:opacity-70">
                <Text className="text-base font-semibold text-charcoal">{item.title}</Text>
                {item.original_yield != null && (
                  <Text className="text-sm text-gray-500 mt-1">Yields {item.original_yield}</Text>
                )}
                {item.tags?.length > 0 && (
                  <View className="flex-row flex-wrap gap-1 mt-2">
                    {item.tags.map((tag) => (
                      <Text
                        key={tag.id}
                        className="text-xs text-sage bg-sage/10 px-2 py-0.5 rounded-full"
                      >
                        {tag.name}
                      </Text>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            </Link>
          )}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-gray-400 text-center">
                {search ? 'No recipes found.' : 'No recipes yet.\nTap + to add to the hearth.'}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      <TouchableOpacity
        onPress={() => router.push('/add-recipe')}
        className="absolute bottom-8 right-6 w-14 h-14 bg-ember rounded-full items-center justify-center"
        style={{ elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
      >
        <Text className="text-white text-3xl leading-none">+</Text>
      </TouchableOpacity>
    </View>
  );
}
