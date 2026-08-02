// components/sourcing/NotificationsBell.jsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, orderBy, limit, onSnapshot,
  doc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebaseClient';

/*
  Lit users/{uid}/notifications (écrites côté serveur par
  netlify/functions/_sourcingShared.js — creerNotificationAgent /
  creerNotificationClient). Le client peut seulement marquer `lu: true`,
  jamais créer de notification lui-même (à verrouiller côté règles Firestore).
*/

function IconBell() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

export default function NotificationsBell({ authUser }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen]     = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!authUser?.uid) return;
    const q = query(
      collection(db, 'users', authUser.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const unsub = onSnapshot(q, snap => {
      setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return unsub;
  }, [authUser?.uid]);

  const unreadCount = notifs.filter(n => !n.lu).length;

  const marquerLue = useCallback((n) => {
    if (!n.lu) {
      updateDoc(doc(db, 'users', authUser.uid, 'notifications', n.id), { lu: true }).catch(() => {});
    }
    setOpen(false);
    if (n.lien) router.push(n.lien);
  }, [authUser?.uid, router]);

  const toutMarquerLu = async () => {
    const batch = writeBatch(db);
    notifs.filter(n => !n.lu).forEach(n => {
      batch.update(doc(db, 'users', authUser.uid, 'notifications', n.id), { lu: true });
    });
    try { await batch.commit(); } catch { /* ignore */ }
  };

  const formatTs = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000)    return "À l'instant";
    if (diff < 3600000)  return Math.floor(diff / 60000) + ' min';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
    return d.toLocaleDateString('fr-FR');
  };

  if (!authUser) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        style={{
          position: 'relative', background: 'rgba(255,255,255,.08)', border: 'none',
          borderRadius: '50%', width: 38, height: 38, display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer',
        }}
      >
        <IconBell/>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, background: '#EF4444',
            color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: '50%',
            minWidth: 16, height: 16, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '0 3px',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }}/>
          <div style={{
            position: 'absolute', top: 46, right: 0, width: 320, maxHeight: 420,
            overflowY: 'auto', background: '#161616', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 14, zIndex: 41, boxShadow: '0 8px 30px rgba(0,0,0,.4)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.08)',
            }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Notifications</span>
              {unreadCount > 0 && (
                <button onClick={toutMarquerLu} style={{
                  background: 'none', border: 'none', color: '#ff4d00', fontSize: 12, cursor: 'pointer',
                }}>
                  Tout marquer lu
                </button>
              )}
            </div>

            {notifs.length === 0 && (
              <p style={{ color: '#ffffff60', fontSize: 13, padding: '24px 14px', textAlign: 'center' }}>
                Aucune notification
              </p>
            )}

            {notifs.map(n => (
              <button
                key={n.id}
                onClick={() => marquerLue(n)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px',
                  background: n.lu ? 'transparent' : 'rgba(255,77,0,.08)',
                  border: 'none', borderBottom: '1px solid rgba(255,255,255,.05)', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{n.titre}</span>
                  <span style={{ color: '#ffffff50', fontSize: 11, flexShrink: 0 }}>{formatTs(n.createdAt)}</span>
                </div>
                {n.corps && <p style={{ color: '#ffffff90', fontSize: 12, margin: '4px 0 0' }}>{n.corps}</p>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}