"use client";

import { useState } from "react";
import { generateShopBadgePDF } from "@/lib/generateShopBadge";

export default function DownloadBadgeButton({ shopId, shopName, className }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDownload = async () => {
    setLoading(true);
    setError(null);
    try {
      await generateShopBadgePDF({ shopId, shopName });
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la génération du badge.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleDownload}
        disabled={loading}
        className={className}
        type="button"
      >
        {loading ? "Génération..." : "Télécharger mon badge boutique (PDF)"}
      </button>
      {error && <p style={{ color: "#e53e3e", fontSize: 13 }}>{error}</p>}
    </div>
  );
}