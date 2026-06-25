'use client';

import { useState } from 'react';
import { saveFCMToken } from '@/lib/firebaseMessaging';

export default function EnableNotificationsButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    try {
      setLoading(true);

      const token = await saveFCMToken();

      if (token) {
        alert(
          '🔔 Notifications activées avec succès'
        );
      }
    } catch (error) {
      console.error(error);

      alert(
        "Impossible d'activer les notifications"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="
        px-4
        py-2
        rounded-xl
        bg-red-600
        text-white
        font-medium
        hover:opacity-90
      "
    >
      {loading
        ? 'Activation...'
        : '🔔 Autoriser les notifications'}
    </button>
  );
}