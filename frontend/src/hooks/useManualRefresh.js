import { useCallback, useRef, useState } from 'react';

/**
 * A Refresh button that is busy only while the person's own tap is loading.
 * Automatic background refreshes (polling, returning to the app) never disable it.
 */
export default function useManualRefresh(refetch) {
  const [refreshing, setRefreshing] = useState(false);
  const running = useRef(false);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    try { await refetch(); } finally { running.current = false; setRefreshing(false); }
  }, [refetch]);
  return [refresh, refreshing];
}
