'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useAgoraPlayer
 * 1. Récupère un token Agora depuis /api/agora-token?channelId=...
 * 2. Rejoint le channel en mode "audience"
 * 3. Affiche le flux vidéo du host (et des co-hosts) dans videoContainerRef
 *
 * Mise à jour (juillet 2026) — adaptation 4G Afrique + robustesse :
 *
 *  - Codec H.264 (au lieu de VP8) : aligné sur GoLive.jsx / CoHostButton,
 *    dont le codec a été changé pour H.264 afin de profiter du décodage
 *    matériel supporté par la quasi-totalité des Android d'entrée de
 *    gamme courants sur le marché visé.
 *
 *  - Fallback automatique vers le flux "low" (setStreamFallbackOption) :
 *    condition nécessaire pour que le enableDualStream() déjà activé côté
 *    hôte (GoLive.jsx) serve à quelque chose. Sans cet appel ici, un
 *    spectateur en 4G faible continuait de recevoir le flux principal
 *    lourd et subissait des gels au lieu d'une bascule en qualité réduite.
 *
 *  - Reconnexion automatique au retour au premier plan (mobile + 4G qui
 *    coupe déjà d'elle-même en arrière-plan), même logique que côté hôte
 *    dans GoLive.jsx.
 *
 *  - Qualité réseau descendante (networkQuality) exposée en plus des
 *    champs existants — pendant côté spectateur du badge réseau déjà
 *    ajouté côté vendeur, à brancher plus tard côté UI si utile.
 *
 *  - subscribe() entouré d'un try/catch : un échec ponctuel de subscribe
 *    (fréquent sur réseau instable) ne casse plus tout le listener
 *    'user-published' pour les événements suivants.
 *
 *  - setLogLevel(3) au lieu de 4 : le niveau 4 (NONE) supprimait aussi les
 *    erreurs, pourtant utiles au diagnostic — 3 = erreurs/avertissements
 *    uniquement, cohérent avec GoLive.jsx / CoHostButton.
 *
 *  - Nettoyage des listeners Agora à la sortie (removeAllListeners) avant
 *    de leave(), pour éviter tout callback fantôme sur un client déjà
 *    abandonné.
 *
 * Comportement inchangé : route API, format de réponse, renouvellement de
 * token sur 'token-privilege-will-expire', valeurs de `status`/`joined`.
 */
export function useAgoraPlayer(channelId, isLive) {
  const videoContainerRef = useRef(null);
  const clientRef         = useRef(null);
  const isMountedRef      = useRef(true);

  const [joined, setJoined]           = useState(false);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [status, setStatus]           = useState('idle');
  // 'idle' | 'fetching-token' | 'connecting' | 'live' | 'offline' | 'error'
  const [error, setError]             = useState(null);
  const [networkQuality, setNetworkQuality] = useState(0); // downlink, échelle Agora 0-6

  // Extrait pour être réutilisé par le renouvellement de token ET par la
  // reconnexion après mise en arrière-plan (évite la duplication).
  const fetchToken = useCallback(async () => {
    const res = await fetch(
      `/api/agora-token?channelId=${encodeURIComponent(channelId)}`
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const { token } = await res.json();
    return token;
  }, [channelId]);

  const playAllVideos = useCallback(() => {
    const client = clientRef.current;
    if (!client || !videoContainerRef.current) return;
    client.remoteUsers.forEach(u => {
      if (u.videoTrack) {
        try { u.videoTrack.play(videoContainerRef.current); } catch (_) {}
      }
    });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (!channelId || !isLive) {
      setStatus('offline');
      setRemoteUsers([]);
      setJoined(false);
      return () => { isMountedRef.current = false; };
    }

    const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!APP_ID) {
      setError('NEXT_PUBLIC_AGORA_APP_ID manquant dans .env.local');
      setStatus('error');
      return () => { isMountedRef.current = false; };
    }

    let cancelled = false;

    async function join() {
      try {
        // ── 1. Récupérer le token depuis la route API ──────────────────────
        setStatus('fetching-token');
        const token = await fetchToken();
        if (cancelled) return;

        // ── 2. Créer le client Agora (import dynamique → pas d'erreur SSR) ─
        setStatus('connecting');
        const mod = await import('agora-rtc-sdk-ng');
        const AgoraRTC = mod.default;
        AgoraRTC.setLogLevel(3); // erreurs + avertissements (voir note en tête de fichier)

        // H.264 : cohérent avec le codec utilisé côté hôte et co-host
        // (GoLive.jsx / CoHostButton) pour un décodage matériel efficace
        // sur les terminaux d'entrée de gamme.
        const client = AgoraRTC.createClient({ mode: 'live', codec: 'h264' });
        clientRef.current = client;

        await client.setClientRole('audience');

        // ── 3. Rejoindre avec le token ─────────────────────────────────────
        await client.join(APP_ID, channelId, token, null);
        if (cancelled) { await client.leave().catch(() => {}); return; }

        setJoined(true);
        setStatus('live');

        // ── 4. S'abonner aux flux du host / co-hosts ────────────────────────
        client.on('user-published', async (user, mediaType) => {
          try {
            await client.subscribe(user, mediaType);
          } catch (e) {
            console.warn('⚠️ subscribe:', e);
            return;
          }

          // Fallback automatique vers le flux "low" si la bande passante
          // descendante du spectateur ne suit pas — pendant côté lecteur
          // du enableDualStream() activé côté hôte. Sans cet appel, le
          // flux léger publié par l'hôte n'est jamais utilisé.
          try { await client.setStreamFallbackOption(user.uid, 1); } catch (_) {}

          if (mediaType === 'video' && videoContainerRef.current && user.videoTrack) {
            try { user.videoTrack.play(videoContainerRef.current); } catch (_) {}
          }
          if (mediaType === 'audio') {
            try { user.audioTrack?.play(); } catch (_) {}
          }

          if (isMountedRef.current) {
            setRemoteUsers(prev =>
              prev.find(u => u.uid === user.uid) ? prev : [...prev, user]
            );
          }
        });

        client.on('user-unpublished', user => {
          if (isMountedRef.current) {
            setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
          }
        });

        client.on('user-left', user => {
          if (isMountedRef.current) {
            setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
          }
        });

        // Qualité réseau descendante — exposée pour un futur indicateur
        // "connexion faible" côté UI (pendant du badge déjà ajouté côté
        // vendeur dans GoLive.jsx).
        client.on('network-quality', (stats) => {
          if (isMountedRef.current) setNetworkQuality(stats?.downlinkNetworkQuality ?? 0);
        });

        client.on('exception', (evt) => {
          console.warn('⚠️ Agora exception (spectateur):', evt.code, evt.msg, evt.uid);
        });

        // Token expire bientôt → re-fetch automatique
        client.on('token-privilege-will-expire', async () => {
          try {
            const newToken = await fetchToken();
            await client.renewToken(newToken);
          } catch (e) {
            console.warn('⚠️ renewToken:', e);
          }
        });

      } catch (err) {
        if (cancelled) return;
        console.error('Agora:', err);
        if (isMountedRef.current) {
          setError(err.message ?? String(err));
          setStatus('error');
        }
      }
    }

    join();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      const client = clientRef.current;
      if (client) {
        try { client.removeAllListeners?.(); } catch (_) {}
        client.leave().catch(() => {});
      }
      clientRef.current = null;
      setJoined(false);
      setRemoteUsers([]);
      setStatus('idle');
    };
  }, [channelId, isLive, fetchToken]);

  // ── Reconnexion au retour au premier plan ──────────────────────────────
  // Sur mobile, le navigateur suspend souvent la connexion WebRTC quand
  // l'app passe en arrière-plan — un cas fréquent en 4G qui coupe déjà
  // régulièrement d'elle-même. Même pattern que côté hôte dans GoLive.jsx.
  useEffect(() => {
    if (!channelId || !isLive) return;
    const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;

    const handle = async () => {
      if (document.visibilityState !== 'visible') return;
      const client = clientRef.current;
      if (!client || !APP_ID) return;
      if (client.connectionState === 'DISCONNECTED' || client.connectionState === 'DISCONNECTING') {
        try {
          setStatus('connecting');
          const token = await fetchToken();
          await client.join(APP_ID, channelId, token, null);
          playAllVideos();
          if (isMountedRef.current) setStatus('live');
        } catch (e) {
          console.warn('⚠️ Reconnexion spectateur:', e);
          if (isMountedRef.current) {
            setError(e.message ?? 'Reconnexion échouée.');
            setStatus('error');
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [channelId, isLive, fetchToken, playAllVideos]);

  return { videoContainerRef, joined, remoteUsers, status, error, networkQuality };
}