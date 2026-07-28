"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode } from "html5-qrcode";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import styles from "./QrScanButton.module.css";

const HOST_PROFILE_ROUTE = "/host";
const GENERATE_URL = "https://fritok.net";

export default function QrScanButton({ className }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("scan");
  const [error, setError] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [mounted, setMounted] = useState(false);

  const scannerRef = useRef(null);
  const router = useRouter();
  const readerId = "qr-reader-region";

  // Portal disponible seulement côté client
  useEffect(() => {
    setMounted(true);
  }, []);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (e) {}
      scannerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen || activeTab !== "scan") {
      stopScanner();
      return;
    }

    const html5QrCode = new Html5Qrcode(readerId);
    scannerRef.current = html5QrCode;

    html5QrCode
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => handleScanSuccess(decodedText),
        () => {}
      )
      .catch((err) => {
        setError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
        console.error(err);
      });

    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen || activeTab !== "generate" || qrDataUrl) return;

    setIsGenerating(true);
    QRCode.toDataURL(GENERATE_URL, {
      width: 300,
      margin: 2,
      color: { dark: "#6B3F1F", light: "#FFF8EE" },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => {
        console.error(err);
        setError("Impossible de générer le QR code.");
      })
      .finally(() => setIsGenerating(false));
  }, [isOpen, activeTab, qrDataUrl]);

  // Bloque le scroll du body pendant que le sheet est ouvert
  useEffect(() => {
    if (isOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [isOpen]);

  const extractHostId = (decodedText) => {
    const trimmed = decodedText.trim();
    if (!trimmed.includes("/") && !trimmed.includes(":")) {
      return trimmed;
    }
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        return segments[segments.length - 1];
      }
    } catch (e) {
      const parts = trimmed.split("/").filter(Boolean);
      return parts[parts.length - 1] || trimmed;
    }
    return trimmed;
  };

  const handleScanSuccess = async (decodedText) => {
    await stopScanner();
    setIsOpen(false);

    const hostId = extractHostId(decodedText);
    if (!hostId) {
      setError("QR code invalide.");
      return;
    }
    router.push(`${HOST_PROFILE_ROUTE}/${hostId}`);
  };

  const handleShare = async () => {
    if (!qrDataUrl) return;
    setIsSharing(true);
    setError(null);

    try {
      const blob = await (await fetch(qrDataUrl)).blob();
      const file = new File([blob], "fritok-qrcode.png", { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "FriTok",
          text: "Rejoins-moi sur FriTok !",
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: "FriTok",
          text: "Rejoins-moi sur FriTok !",
          url: GENERATE_URL,
        });
      } else {
        const link = document.createElement("a");
        link.href = qrDataUrl;
        link.download = "fritok-qrcode.png";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        console.error(e);
        setError("Impossible de partager le QR code.");
      }
    } finally {
      setIsSharing(false);
    }
  };

  const closeModal = async () => {
    await stopScanner();
    setIsOpen(false);
    setError(null);
    setActiveTab("scan");
    setQrDataUrl(null);
  };

  const switchTab = (tab) => {
    setError(null);
    setActiveTab(tab);
  };

  const sheetContent = isOpen && (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle} />

        <div className={styles.header}>
          <h3 className={styles.title}>
            {activeTab === "scan" ? "Scannez le badge" : "Mon QR code"}
          </h3>
          <button className={styles.closeBtn} onClick={closeModal} type="button">
            ✕
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "scan" ? styles.tabActive : ""}`}
            onClick={() => switchTab("scan")}
          >
            Scanner
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "generate" ? styles.tabActive : ""}`}
            onClick={() => switchTab("generate")}
          >
            Générer
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === "scan" && (
            <div id={readerId} className={styles.reader} />
          )}

          {activeTab === "generate" && (
            <div className={styles.generatePane}>
              {isGenerating && <p className={styles.hint}>Génération du QR code...</p>}

              {qrDataUrl && !isGenerating && (
                <>
                  <img src={qrDataUrl} alt="QR code FriTok" className={styles.qrImage} />
                  <p className={styles.hint}>{GENERATE_URL}</p>
                  <button
                    type="button"
                    className={styles.shareBtn}
                    onClick={handleShare}
                    disabled={isSharing}
                  >
                    {isSharing ? "Partage..." : "Partager"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={className || styles.cta}
        type="button"
      >
        Scanner un QR code
      </button>

      {mounted && sheetContent && createPortal(sheetContent, document.body)}
    </>
  );
}