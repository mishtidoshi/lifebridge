// The bottom tab bar: Home, My plans, Settings, and the account at the far right.
// Topics, plans, and steps open on top of the tabs (with a Back button), from the root layout.

import { Tabs } from 'expo-router';
import { FolderOpen, House, Settings, UserRound, type LucideIcon } from 'lucide-react-native';
import type { ColorValue } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useFlow } from '@/lib/flow';
import { colors, fonts } from '@/lib/theme';
import { TOPICS } from '@/lib/topics';

function icon(Icon: LucideIcon) {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon size={24} color={color as string} strokeWidth={focused ? 2.5 : 2} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const auth = useAuth();
  const flow = useFlow();
  const firstName = auth.user ? auth.name.first : '';
  const savedCount = TOPICS.filter((t) => flow.progress[t.id]?.facts).length;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 60 },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
        tabBarItemStyle: { paddingVertical: 4 },
        headerShown: false, 
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon(House) }} />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'My plans',
          tabBarIcon: icon(FolderOpen),
          tabBarBadge: savedCount > 0 ? savedCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.primaryText, fontFamily: fonts.bold },
        }}
      />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon(Settings) }} />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Your account',
          tabBarLabel: auth.user ? firstName || 'Account' : 'Sign in',
          tabBarIcon: icon(UserRound),
        }}
      />
    </Tabs>
  );
}
