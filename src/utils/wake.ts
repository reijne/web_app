// useWakeLock.ts
import { useEffect, useRef } from 'react';

export function useWakeLock(enabled: boolean) {
    // eslint-disable-next-line
    const sentinelRef = useRef<any | null>(null);
    // TODO: Fix that we can use this type.
    // const sentinelRef = useRef<WakeLockSentinel | null>(null);

    // Re-acquire on visibility changes (browsers release locks when tab hides)
    useEffect(() => {
        const onVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && enabled) {
                await request();
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [enabled]);

    // Acquire/release with enabled
    useEffect(() => {
        if (!enabled) {
            release();
            return;
        }
        request();

        return () => {
            release();
        };
    }, [enabled]);

    async function request() {
        try {
            // TODO: Fix that we can use the navigator type.
            // eslint-disable-next-line
            if ('wakeLock' in navigator && (navigator as any).wakeLock?.request != null) {
                // Some browsers require a user gesture: it's best to call this from your Play/Start handler too.
                // eslint-disable-next-line
                sentinelRef.current = await (navigator as any).wakeLock.request('screen');
                // If the lock is released (e.g., system reasons), try to re-acquire when enabled
                sentinelRef.current.addEventListener?.('release', () => {
                    if (enabled && document.visibilityState === 'visible') {
                        request().catch(() => {});
                    }
                });
            } else {
                // Fallback: optionally integrate NoSleep.js here
                // console.warn('Screen Wake Lock API not supported; consider NoSleep.js fallback.');
            }
        } catch {
            // Permission or platform may block it; don't crash.
            // console.warn('Wake Lock request failed:', err);
        }
    }

    function release() {
        try {
            sentinelRef.current?.release?.();
        } catch {}
        sentinelRef.current = null;
    }
}
