import QRCode from "qrcode";
import { jsPDF } from "jspdf";

/**
 * Génère un badge boutique en PDF format A5 (148 x 210 mm)
 * @param {Object} shop - { shopId, shopName }
 */
export async function generateShopBadgePDF(shop) {
  const { shopId, shopName } = shop;

  if (!shopId || !shopName) {
    throw new Error("shopId et shopName sont requis");
  }

  const shopUrl = `https://fritok.net/shop/${shopId}?src=badge`;

  // 1. Génère le QR code en data URL (haute résolution pour impression nette)
  const qrDataUrl = await QRCode.toDataURL(shopUrl, {
    errorCorrectionLevel: "M", // tolère 15% de dégradation (froissé/sali)
    width: 800,                // haute résolution pour impression
    margin: 2,                 // quiet zone intégrée
    color: {
      dark: "#1a1a1a",
      light: "#ffffff",
    },
  });

  // 2. Crée le PDF au format A5 (148 x 210 mm)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a5",
  });

  const pageWidth = 148;
  const pageHeight = 210;
  const centerX = pageWidth / 2;

  // --- Fond blanc avec coins arrondis (bordure décorative) ---
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.roundedRect(4, 4, pageWidth - 8, pageHeight - 8, 4, 4, "S");

  // --- Bandeau orange "FriTok" ---
  const bannerY = 15;
  const bannerHeight = 14;
  const bannerWidth = 60;
  const bannerX = centerX - bannerWidth / 2;

  doc.setFillColor(255, 122, 0); // orange FriTok
  doc.roundedRect(bannerX, bannerY, bannerWidth, bannerHeight, 7, 7, "F");

  // Icône "play" simplifiée (cercle blanc + triangle orange)
  const iconCx = bannerX + 12;
  const iconCy = bannerY + bannerHeight / 2;
  doc.setFillColor(255, 255, 255);
  doc.circle(iconCx, iconCy, 4, "F");
  doc.setFillColor(255, 122, 0);
  doc.triangle(
    iconCx - 1.3, iconCy - 2.2,
    iconCx - 1.3, iconCy + 2.2,
    iconCx + 2.2, iconCy,
    "F"
  );

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("FriTok", bannerX + 20, bannerY + bannerHeight / 2 + 2);

  // --- QR Code centré ---
  const qrSize = 80; // 8cm, confortable pour scan à ~30cm
  const qrX = centerX - qrSize / 2;
  const qrY = 45;
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  // --- Nom de la boutique ---
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(shopName, centerX, qrY + qrSize + 15, { align: "center" });

  // --- Sous-titre ---
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(
    "Scannez pour voir nos produits en vidéo",
    centerX,
    qrY + qrSize + 24,
    { align: "center" }
  );

  // --- URL en clair (fallback) ---
  doc.setTextColor(180, 180, 180);
  doc.setFontSize(9);
  doc.text(
    shopUrl.replace("https://", "").replace("?src=badge", ""),
    centerX,
    pageHeight - 15,
    { align: "center" }
  );

  // 3. Télécharge le PDF
  const filename = `badge-${shopId}.pdf`;
  doc.save(filename);
}