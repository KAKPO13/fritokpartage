"use client";

import { useState, useRef, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useRouter } from "next/navigation";
import styles from "./QrScanButton.module.css";

// Ajuste ce préfixe selon ta route réelle de profil hôte
const HOST_PROFILE_ROUTE = "/host"; // ex: /host/[id].js ou /host/[id]/page.jsx

export default function QrScanButton({ className }) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState(null);
  const scannerRef = useRef(null);
  const router = useRouter();
  const readerId = "qr-reader-region";

  useEffect(() => {
    if (!isOpen) return;

    const html5QrCode = new Html5Qrcode(readerId);
    scannerRef.current = html5QrCode;

    html5QrCode
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        () => {}
      )
      .catch((err) => {
        setError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
        console.error(err);
      });

    return () => {
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => scannerRef.current.clear())
          .catch(() => {});
      }
    };
  }, [isOpen]);

  /**
   * Extrait l'ID hôte depuis le contenu scanné, peu importe le format :
   * - "abc123xyz" (ID brut)
   * - "https://fritok.net/host/abc123xyz"
   * - "https://fritok.net/host/abc123xyz?ref=badge"
   * - "fritok://host/abc123xyz"
   */
  const extractHostId = (decodedText) => {
    const trimmed = decodedText.trim();

    // Cas 1 : ID brut (pas de "/" ni "://")
    if (!trimmed.includes("/") && !trimmed.includes(":")) {
      return trimmed;
    }

    // Cas 2 : essaie de parser comme URL (http(s):// ou fritok://)
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split("/").filter(Boolean);
      // Prend le dernier segment du chemin comme ID
      // ex: /host/abc123xyz -> "abc123xyz"
      if (segments.length > 0) {
        return segments[segments.length - 1];
      }
    } catch (e) {
      // Pas une URL valide, fallback : dernier segment après "/"
      const parts = trimmed.split("/").filter(Boolean);
      return parts[parts.length - 1] || trimmed;
    }

    return trimmed;
  };

  const handleScanSuccess = async (decodedText) => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (e) {}
    }
    setIsOpen(false);

    const hostId = extractHostId(decodedText);

    if (!hostId) {
      setError("QR code invalide.");
      return;
    }

    router.push(`${HOST_PROFILE_ROUTE}/${hostId}`);
  };

  const closeModal = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (e) {}
    }
    setIsOpen(false);
    setError(null);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={className || styles.cta}
        type="button"
      >
        Scanner un QR code
      </button>

      {isOpen && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeBtn} onClick={closeModal}>
              ✕
            </button>
            <h3>Scannez le badge</h3>
            <div id={readerId} className={styles.reader} />
            {error && <p className={styles.error}>{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}