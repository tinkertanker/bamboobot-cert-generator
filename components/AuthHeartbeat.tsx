"use client";

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

const HEARTBEAT_MS = 5 * 60 * 1000; // 5 minutes

export function AuthHeartbeat() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return;
    let timer: NodeJS.Timeout | null = null;

    const ping = () => {
      // Best-effort; ignore failures
      fetch('/api/metrics/heartbeat', { method: 'POST' }).catch(() => void 0);
    };

    // Initial ping on mount/sign-in
    ping();
    timer = setInterval(ping, HEARTBEAT_MS);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status]);

  return null;
}

