import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';

import { useTheme } from '@/hooks/use-theme';

/**
 * Root tab bar. Each tab is a folder under `src/app` with its own Stack `_layout.tsx`,
 * so feature screens can be pushed inside a tab with native headers and back navigation.
 * Android supports at most 5 tabs.
 */
export default function AppTabs() {
  const colors = useTheme();

  return (
    <NativeTabs
      backgroundColor={colors.tabBarBackground}
      indicatorColor={colors.tabBarActiveBackground}
      // Android hides unselected labels from 4 tabs up; keep every label visible.
      labelVisibilityMode="labeled"
      tintColor={colors.tabBarActive}
      iconColor={{ default: colors.tabBarInactive, selected: colors.tabBarActive }}
      labelStyle={{ default: { color: colors.tabBarInactive }, selected: { color: colors.tabBarActive } }}>
      {/* Home must be the first trigger: NativeTabs opens on the first tab (it ignores initialRouteName). */}
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          md="home"
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="store">
        <NativeTabs.Trigger.Label>Store</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bag" md="storefront" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="book">
        <NativeTabs.Trigger.Label>Book</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="event" />
      </NativeTabs.Trigger>

      {/* Hidden until Explore has content; the route stays in place. */}
      <NativeTabs.Trigger name="explore" hidden>
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          md="explore"
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
