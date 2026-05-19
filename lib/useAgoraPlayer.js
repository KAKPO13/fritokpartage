'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * useAgoraPlayer
 * Rejoint un channel Agora en mode "audience" et publie le flux vidéo
 * du host dans le <div> référencé par videoContainerRef.
 *
 * @param {string} channelId  - ex: "live_55OKez34r5gsAndkgMweTyC9u002_1775923605912"
 * @param {boolean} isLive    - false = le live est terminé, on n'essaie pas de rejoindre
 * @returns {{ videoContainerRef, joined, remoteUsers, error, leave }}
 */
export function useAgoraPlayer(channelId, isLive) {
  const videoContainerRef = useRef(null);
  const clientRef         = useRef(null);
  const [joined, setJoined]           = useState(false);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [error, setError]             = useState(null);

  useEffect(() => {
    if (!channelId || !isLive) return;

    const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!APP_ID) {
      setError('NEXT_PUBLIC_AGORA_APP_ID manquant dans .env.local');
      return;
    }

    let AgoraRTC;
    let client;
    let cancelled = false;

    async function join() {
      try {
        // Import dynamique pour éviter les erreurs SSR (Agora = browser only)
        const mod = await import('agora-rtc-sdk-ng');
        AgoraRTC = mod.default;

        AgoraRTC.setLogLevel(4); // erreurs uniquement

        client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
        clientRef.current = client;

        // Mode spectateur
        await client.setClientRole('audience');

        // Rejoindre le channel sans token (mode test Agora)
        // En production : générer un token côté serveur
        await client.join(APP_ID, channelId, null, null);

        if (cancelled) return;
        setJoined(true);

        // Quand un host publie son flux
        client.on('user-published', async (user, mediaType) => {
          await client.subscribe(user, mediaType);

          if (mediaType === 'video' && videoContainerRef.current) {
            user.videoTrack.play(videoContainerRef.current);
          }
          if (mediaType === 'audio') {
            user.audioTrack.play();
          }

          setRemoteUsers(prev => {
            const exists = prev.find(u => u.uid === user.uid);
            return exists ? prev : [...prev, user];
          });
        });

        // Quand un host coupe son flux
        client.on('user-unpublished', (user) => {
          setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
        });

        client.on('user-left', (user) => {
          setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
        });

      } catch (err) {
        if (!cancelled) {
          console.error('Agora join error:', err);
          setError('Impossible de rejoindre le live : ' + (err.message ?? err));
        }
      }
    }

    join();

    return () => {
      cancelled = true;
      if (clientRef.current) {
        clientRef.current.leave().catch(() => {});
        clientRef.current = null;
      }
      setJoined(false);
      setRemoteUsers([]);
    };
  }, [channelId, isLive]);

  const leave = async () => {
    if (clientRef.current) {
      await clientRef.current.leave().catch(() => {});
      clientRef.current = null;
    }
    setJoined(false);
    setRemoteUsers([]);
  };

  return { videoContainerRef, joined, remoteUsers, error, leave };
}
