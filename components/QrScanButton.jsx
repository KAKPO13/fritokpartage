"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode } from "html5-qrcode";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import styles from "./QrScanButton.module.css";

const HOST_PROFILE_ROUTE = "/host";
const GENERATE_URL = "https://fritok.net";

// Format attendu : PB-ABJ-000193 (2 lettres - 3 lettres - 6 chiffres)
const COLIS_CODE_REGEX = /^[A-Z]{2}-[A-Z]{3}-\d{6}$/;

export default function QrScanButton({ className }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("scan"); // "scan" | "generate" | "colis"
  const [error, setError] = useState(null);
  const [mounted, setMounted] = useState(false);

  // Onglet "Générer" (lien fritok.net)
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Onglet "Colis" (code manuel)
  const [colisCode, setColisCode] = useState("");
  const [colisQrDataUrl, setColisQrDataUrl] = useState(null);
  const [isGeneratingColis, setIsGeneratingColis] = useState(false);
  const [isSharingColis, setIsSharingColis] = useState(false);
  const [colisError, setColisError] = useState(null);

  const scannerRef = useRef(null);
  const router = useRouter();
  const readerId = "qr-reader-region";

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

  const shareQrImage = async (dataUrl, filename, setSharingFn) => {
    if (!dataUrl) return;
    setSharingFn(true);

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "FriTok",
          text: "QR code FriTok",
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: "FriTok",
          text: "QR code FriTok",
          url: GENERATE_URL,
        });
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        console.error(e);
        throw e;
      }
    } finally {
      setSharingFn(false);
    }
  };

  const handleShare = async () => {
    setError(null);
    try {
      await shareQrImage(qrDataUrl, "fritok-qrcode.png", setIsSharing);
    } catch {
      setError("Impossible de partager le QR code.");
    }
  };

  const handleColisCodeChange = (e) => {
    // Force en majuscules pour matcher le format attendu
    const value = e.target.value.toUpperCase();
    setColisCode(value);
    setColisError(null);
  };

  const handleGenerateColisQr = async () => {
    setColisError(null);

    if (!COLIS_CODE_REGEX.test(colisCode)) {
      setColisError("Format attendu : PB-ABJ-000193");
      return;
    }

    setIsGeneratingColis(true);
    try {
      const url = await QRCode.toDataURL(colisCode, {
        width: 300,
        margin: 2,
        color: { dark: "#6B3F1F", light: "#FFF8EE" },
      });
      setColisQrDataUrl(url);
    } catch (err) {
      console.error(err);
      setColisError("Impossible de générer le QR code.");
    } finally {
      setIsGeneratingColis(false);
    }
  };

  const handleShareColis = async () => {
    setColisError(null);
    try {
      await shareQrImage(
        colisQrDataUrl,
        `${colisCode || "colis"}.png`,
        setIsSharingColis
      );
    } catch {
      setColisError("Impossible de partager le QR code.");
    }
  };

  const closeModal = async () => {
    await stopScanner();
    setIsOpen(false);
    setError(null);
    setActiveTab("scan");
    setQrDataUrl(null);
    setColisCode("");
    setColisQrDataUrl(null);
    setColisError(null);
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
            {activeTab === "scan" && "Scannez le badge"}
            {activeTab === "generate" && "Mon QR code"}
            {activeTab === "colis" && "QR code colis"}
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
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "colis" ? styles.tabActive : ""}`}
            onClick={() => switchTab("colis")}
          >
            Colis
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

          {activeTab === "colis" && (
            <div className={styles.colisPane}>
              <input
                type="text"
                inputMode="text"
                placeholder="PB-ABJ-000193"
                value={colisCode}
                onChange={handleColisCodeChange}
                className={styles.colisInput}
                maxLength={13}
              />

              <button
                type="button"
                className={styles.generateBtn}
                onClick={handleGenerateColisQr}
                disabled={isGeneratingColis || !colisCode}
              >
                {isGeneratingColis ? "Génération..." : "Générer le QR code"}
              </button>

              {colisError && <p className={styles.error}>{colisError}</p>}

              {colisQrDataUrl && (
                <>
                  <img
                    src={colisQrDataUrl}
                    alt={`QR code ${colisCode}`}
                    className={styles.qrImage}
                  />
                  <p className={styles.hint}>{colisCode}</p>
                  <button
                    type="button"
                    className={styles.shareBtn}
                    onClick={handleShareColis}
                    disabled={isSharingColis}
                  >
                    {isSharingColis ? "Partage..." : "Partager"}
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