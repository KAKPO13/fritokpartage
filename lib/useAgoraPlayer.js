'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * useAgoraPlayer
 * 1. Récupère un token Agora depuis /api/agora-token?channelId=...
 * 2. Rejoint le channel en mode "audience"
 * 3. Affiche le flux vidéo du host dans videoContainerRef
 */
export function useAgoraPlayer(channelId, isLive) {
  const videoContainerRef = useRef(null);
  const clientRef         = useRef(null);

  const [joined, setJoined]           = useState(false);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [status, setStatus]           = useState('idle');
  // 'idle' | 'fetching-token' | 'connecting' | 'live' | 'offline' | 'error'
  const [error, setError]             = useState(null);

  useEffect(() => {
    if (!channelId || !isLive) {
      setStatus('offline');
      return;
    }

    const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!APP_ID) {
      setError('NEXT_PUBLIC_AGORA_APP_ID manquant dans .env.local');
      setStatus('error');
      return;
    }

    let cancelled = false;

    async function join() {
      try {
        // ── 1. Récupérer le token depuis la route API ──────────────────────
        setStatus('fetching-token');
        const res = await fetch(
          `/api/agora-token?channelId=${encodeURIComponent(channelId)}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const { token } = await res.json();
        if (cancelled) return;

        // ── 2. Créer le client Agora (import dynamique → pas d'erreur SSR) ─
        setStatus('connecting');
        const mod = await import('agora-rtc-sdk-ng');
        const AgoraRTC = mod.default;
        AgoraRTC.setLogLevel(4); // erreurs uniquement

        const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
        clientRef.current = client;

        await client.setClientRole('audience');

        // ── 3. Rejoindre avec le token ─────────────────────────────────────
        await client.join(APP_ID, channelId, token, null);
        if (cancelled) return;

        setJoined(true);
        setStatus('live');

        // ── 4. S'abonner aux flux du host ──────────────────────────────────
        client.on('user-published', async (user, mediaType) => {
          await client.subscribe(user, mediaType);

          if (mediaType === 'video' && videoContainerRef.current) {
            user.videoTrack.play(videoContainerRef.current);
          }
          if (mediaType === 'audio') {
            user.audioTrack.play();
          }

          setRemoteUsers(prev =>
            prev.find(u => u.uid === user.uid) ? prev : [...prev, user]
          );
        });

        client.on('user-unpublished', user =>
          setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid))
        );

        client.on('user-left', user =>
          setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid))
        );

        // Token expire bientôt → re-fetch automatique
        client.on('token-privilege-will-expire', async () => {
          try {
            const r2 = await fetch(
              `/api/agora-token?channelId=${encodeURIComponent(channelId)}`
            );
            const { token: newToken } = await r2.json();
            await client.renewToken(newToken);
          } catch (_) {}
        });

      } catch (err) {
        if (cancelled) return;
        console.error('Agora:', err);
        setError(err.message ?? String(err));
        setStatus('error');
      }
    }

    join();

    return () => {
      cancelled = true;
      clientRef.current?.leave().catch(() => {});
      clientRef.current = null;
      setJoined(false);
      setRemoteUsers([]);
      setStatus('idle');
    };
  }, [channelId, isLive]);

  return { videoContainerRef, joined, remoteUsers, status, error };
}
