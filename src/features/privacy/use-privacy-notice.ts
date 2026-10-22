import { useCallback, useEffect, useState } from 'react';

import { getNotice, getPublicConfig, type PublicConfig } from './privacy-api';
import type { Notice } from './privacy-logic';

type State =
  | { state: 'loading'; notice: null; config: null; error: null }
  | { state: 'ready'; notice: Notice; config: PublicConfig | null; error: null }
  | { state: 'error'; notice: null; config: null; error: string };

const LOADING: State = { state: 'loading', notice: null, config: null, error: null };

async function read(): Promise<State> {
  try {
    const [notice, config] = await Promise.all([getNotice(), getPublicConfig().catch(() => null)]);
    return { state: 'ready', notice, config, error: null };
  } catch (e) {
    return { state: 'error', notice: null, config: null, error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

/**
 * The privacy notice and the club's contact details, read from the server so the app and the website always show
 * the same thing. A failed read is reported as an error, never shown as "no notice".
 */
export function usePrivacyNotice() {
  const [s, setS] = useState<State>(LOADING);

  useEffect(() => {
    let live = true;
    void read().then((next) => {
      if (live) setS(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setS(LOADING);
    setS(await read());
  }, []);

  return { ...s, reload };
}
