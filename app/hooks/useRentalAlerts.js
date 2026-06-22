// hooks/useRentalAlerts.js
// ─────────────────────────────────────────────────────────────────────────────
//  Surveille les locations actives et déclenche :
//   • 45 min → notification d'avertissement + vibration courte
//   • 60 min → notification persistante + vibration longue + bannière in-app
//
//  Usage dans app.js :
//    import useRentalAlerts from '../hooks/useRentalAlerts';
//    // dans FritokApp, après la déclaration de activeRentals :
//    useRentalAlerts(activeRentals);
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';

const WARN_MS  = 45 * 60 * 1000;   // 45 minutes
const LIMIT_MS = 60 * 60 * 1000;   // 60 minutes

// IDs des alertes déjà envoyées pour éviter les doublons
const _firedWarn  = new Set();
const _firedLimit = new Set();

export default function useRentalAlerts(activeRentals) {
  const intervalRef = useRef(null);
  const [alerts, setAlerts] = useState([]); // bannières in-app

  // ── Demande permission notifications au premier usage ────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ── Boucle de surveillance toutes les 30 secondes ────────────────────────
  useEffect(() => {
    if (!activeRentals?.length) {
      clearInterval(intervalRef.current);
      return;
    }

    const check = () => {
      const now = Date.now();

      activeRentals.forEach((r) => {
        const startTs = r.startTime?.toDate
          ? r.startTime.toDate().getTime()
          : typeof r.startTime === 'number'
            ? r.startTime
            : null;

        if (!startTs) return;

        const elapsed = now - startTs;
        const qr      = r.qrCode || r.id;

        // ── Alerte 45 min ──────────────────────────────────────────────────
        if (elapsed >= WARN_MS && elapsed < LIMIT_MS && !_firedWarn.has(r.id)) {
          _firedWarn.add(r.id);
          const remaining = Math.ceil((LIMIT_MS - elapsed) / 60000);
          fireNotification({
            title  : '⚡ Fritok — Rappel location',
            body   : `Power bank ${qr} : il te reste ~${remaining} min avant la limite. Pense à le rendre !`,
            tag    : `warn-${r.id}`,
            vibrate: [200, 100, 200],
            urgent : false,
          });
          addAlert({
            id     : `warn-${r.id}`,
            type   : 'warn',
            qrCode : qr,
            message: `⏱️ Il te reste ~${remaining} min pour rendre ${qr}`,
          });
        }

        // ── Alerte 60 min — persistante ────────────────────────────────────
        if (elapsed >= LIMIT_MS && !_firedLimit.has(r.id)) {
          _firedLimit.add(r.id);
          fireNotification({
            title  : '🚨 Fritok — Limite atteinte !',
            body   : `Power bank ${qr} : 1h dépassée ! Rends-le immédiatement pour récupérer ta caution.`,
            tag    : `limit-${r.id}`,
            vibrate: [500, 200, 500, 200, 500, 200, 800],
            urgent : true,
            requireInteraction: true,
          });
          addAlert({
            id     : `limit-${r.id}`,
            type   : 'limit',
            qrCode : qr,
            message: `🚨 1h dépassée ! Rends ${qr} maintenant pour garder ta caution.`,
          });
        }
      });
    };

    check(); // vérif immédiate
    intervalRef.current = setInterval(check, 30_000);
    return () => clearInterval(intervalRef.current);
  }, [activeRentals]);

  // ── Nettoie les alertes des locations terminées ───────────────────────────
  useEffect(() => {
    if (!activeRentals?.length) {
      setAlerts([]);
      return;
    }
    const activeIds = new Set(activeRentals.map(r => r.id));
    setAlerts(prev => prev.filter(a => {
      const rentalId = a.id.replace(/^(warn|limit)-/, '');
      return activeIds.has(rentalId);
    }));
  }, [activeRentals]);

  const dismissAlert = (alertId) => setAlerts(prev => prev.filter(a => a.id !== alertId));

  const addAlert = (alert) => {
    setAlerts(prev => {
      if (prev.find(a => a.id === alert.id)) return prev;
      return [...prev, alert];
    });
  };

  return { alerts, dismissAlert };
}

// ── Déclenche une Web Notification ───────────────────────────────────────────
function fireNotification({ title, body, tag, vibrate, urgent, requireInteraction = false }) {
  // Vibration (fonctionne même sans permission notif)
  if ('vibrate' in navigator) {
    navigator.vibrate(vibrate);
  }

  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const opts = {
    body,
    tag,
    icon       : '/icons/icon-192x192.png',
    badge      : '/icons/badge-72x72.png',
    requireInteraction,
    silent     : false,
    data       : { urgent },
  };

  // Service Worker (push persistant même app en arrière-plan)
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, opts);
    });
  } else {
    new Notification(title, opts);
  }
}