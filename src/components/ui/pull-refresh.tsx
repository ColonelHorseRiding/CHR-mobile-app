import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * The platform's pull-to-refresh indicator, themed, for any screen.
 * - One refresh at a time: pulling again while one runs does nothing.
 * - The indicator follows the real request and always clears, even if it fails
 *   (each screen shows its own error and keeps its existing content).
 */
export function usePullRefresh(refresh: () => Promise<unknown> | void): ReactElement<RefreshControlProps> {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    try {
      await refresh();
    } catch {
      // The screen reports its own failure.
    } finally {
      running.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [refresh]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={theme.primary}
      colors={[theme.primary]}
      progressBackgroundColor={theme.surface}
    />
  );
}
