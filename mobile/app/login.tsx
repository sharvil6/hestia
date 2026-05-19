import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { setUserId } from '../lib/user';

const FAMILY_MEMBERS = [
  { id: '1', name: 'Mom', bg: 'bg-red-100', text: 'text-red-700' },
  { id: '2', name: 'Dad', bg: 'bg-blue-100', text: 'text-blue-700' },
  { id: '3', name: 'Kids', bg: 'bg-green-100', text: 'text-green-700' },
];

export default function Login() {
  const router = useRouter();

  const handleLogin = async (id: string) => {
    await setUserId(id);
    router.back();
  };

  return (
    <View className="flex-1 bg-cream items-center justify-center px-6">
      <Text className="text-4xl text-ember mb-2" style={{ fontFamily: 'serif' }}>
        Welcome to Hestia
      </Text>
      <Text className="text-gray-500 mb-12 text-base">Who is cooking today?</Text>

      <View className="flex-row gap-6 flex-wrap justify-center">
        {FAMILY_MEMBERS.map((member) => (
          <TouchableOpacity
            key={member.id}
            onPress={() => handleLogin(member.id)}
            className={`w-24 h-24 rounded-full items-center justify-center ${member.bg} active:opacity-70`}
            style={{ elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}
          >
            <Text className={`text-xl font-semibold ${member.text}`}>{member.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
