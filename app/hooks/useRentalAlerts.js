// hooks/useRentalAlerts.js
import { useEffect, useRef, useState } from 'react';

const WARN_MS  = 45 * 60 * 1000;
const LIMIT_MS = 60 * 60 * 1000;

const _firedWarn  = new Set();
const _firedLimit = new Set();

export default function useRentalAlerts(activeRentals) {
  const intervalRef = useRef(null);
  const [alerts, setAlerts] = useState([]);

  // ── Permission notifications (client uniquement) ──────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // ── Boucle de surveillance ────────────────────────────────────────────────
  useEffect(() => {
    // Garde SSR : ne rien faire hors navigateur
    if (typeof window === 'undefined') return;
    if (!activeRentals?.length) {
      clearInterval(intervalRef.current);
      return;
    }

    const addAlert = (alert) => {
      setAlerts(prev => {
        if (prev.find(a => a.id === alert.id)) return prev;
        return [...prev, alert];
      });
    };

    const fireNotification = ({ title, body, tag, vibrate, requireInteraction = false }) => {
      // Vibration d'abord — fonctionne sans permission notif
      try {
        if ('vibrate' in navigator) navigator.vibrate(vibrate);
      } catch (_) {}

      // Web Notification
      try {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        const opts = { body, tag, icon: '/icons/icon-192x192.png', requireInteraction, silent: false };
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready
            .then(reg => reg.showNotification(title, opts))
            .catch(() => {});
        } else {
          new Notification(title, opts);
        }
      } catch (_) {}
    };

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

        // 45 min
        if (elapsed >= WARN_MS && elapsed < LIMIT_MS && !_firedWarn.has(r.id)) {
          _firedWarn.add(r.id);
          const remaining = Math.ceil((LIMIT_MS - elapsed) / 60000);
          fireNotification({
            title  : '⚡ Fritok — Rappel location',
            body   : `Power bank ${qr} : ~${remaining} min restantes. Pense à le rendre !`,
            tag    : `warn-${r.id}`,
            vibrate: [200, 100, 200],
          });
          addAlert({ id: `warn-${r.id}`, type: 'warn', qrCode: qr, message: `⏱️ Il te reste ~${remaining} min pour rendre ${qr}` });
        }

        // 60 min
        if (elapsed >= LIMIT_MS && !_firedLimit.has(r.id)) {
          _firedLimit.add(r.id);
          fireNotification({
            title             : '🚨 Fritok — Limite atteinte !',
            body              : `Power bank ${qr} : 1h dépassée ! Rends-le maintenant.`,
            tag               : `limit-${r.id}`,
            vibrate           : [500, 200, 500, 200, 500, 200, 800],
            requireInteraction: true,
          });
          addAlert({ id: `limit-${r.id}`, type: 'limit', qrCode: qr, message: `🚨 1h dépassée ! Rends ${qr} maintenant.` });
        }
      });
    };

    check();
    intervalRef.current = setInterval(check, 30_000);
    return () => clearInterval(intervalRef.current);
  }, [activeRentals]);

  // ── Nettoie les alertes des locations terminées ───────────────────────────
  useEffect(() => {
    if (!activeRentals?.length) { setAlerts([]); return; }
    const activeIds = new Set(activeRentals.map(r => r.id));
    setAlerts(prev => prev.filter(a => {
      const rentalId = a.id.replace(/^(warn|limit)-/, '');
      return activeIds.has(rentalId);
    }));
  }, [activeRentals]);

  const dismissAlert = (alertId) =>
    setAlerts(prev => prev.filter(a => a.id !== alertId));

  return { alerts, dismissAlert };
}