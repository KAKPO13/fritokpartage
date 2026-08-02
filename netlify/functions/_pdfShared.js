// netlify/functions/_pdfShared.js

import PDFDocument from 'pdfkit';

/* ══════════════════════════════════════════════════════════
   GÉNÉRATION PDF — bon de sourcing récapitulatif
   Généré en mémoire (Buffer), jamais écrit sur disque — cohérent avec
   l'environnement Netlify Functions (filesystem éphémère/lecture seule).
══════════════════════════════════════════════════════════ */
export function genererPdfBon(requestId, items, devis, agentSelectionMode = 'manuel') {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).fillColor('#ff4d00').text('FriTok', { continued: true });
    doc.fillColor('#000').text(' — Bon de sourcing');
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor('#888').text(`Référence : ${requestId}`);

    // Mention du mode de sélection de l'agent — traçabilité visible sur le
    // document lui-même, pas seulement dans Firestore (agentSelectionMode).
    const mentionSelection = agentSelectionMode === 'manuel'
      ? 'Agent choisi par le client'
      : 'Agent assigné automatiquement';
    doc.fontSize(9).fillColor('#888').text(mentionSelection);

    doc.fillColor('#000');
    doc.moveDown(1);

    doc.fontSize(13).text('Produits demandés');
    doc.moveDown(0.5);

    items.forEach((item, i) => {
      doc.fontSize(10).text(`${i + 1}. ${item.titre}`);
      doc.fontSize(9).fillColor('#555')
        .text(`   Quantité : ${item.quantite}  —  Prix unitaire : ${item.prixUnitaire.toLocaleString('fr-FR')} ${item.currency}`);
      doc.fontSize(8).fillColor('#ff4d00').text(`   ${item.lienProduit}`);
      doc.fillColor('#000');
      doc.moveDown(0.4);
    });

    doc.moveDown(0.4);
    doc.fontSize(13).text('Devis');
    doc.moveDown(0.3);

    const ligne = (label, montant) =>
      doc.fontSize(10).text(`${label} : ${montant.toLocaleString('fr-FR')} ${devis.currency}`);

    ligne('Sous-total articles', devis.sousTotal);
    ligne('Frais sourcing', devis.feeItems + devis.feePerOrder);
    ligne('Commission', devis.commission);
    ligne('Livraison', devis.shippingToClient);
    doc.moveDown(0.3);
    doc.fontSize(13).fillColor('#ff4d00').text(`Total à payer : ${devis.total.toLocaleString('fr-FR')} ${devis.currency}`);
    doc.fillColor('#000');

    doc.moveDown(1.2);
    doc.fontSize(8).fillColor('#888')
      .text('Ce document est un récapitulatif informatif, pas une facture. Le paiement reste à effectuer depuis l\'application FriTok.');

    doc.end();
  });
}

/* ══════════════════════════════════════════════════════════
   ENVOI EMAIL — Resend API, pièce jointe PDF en base64
══════════════════════════════════════════════════════════ */
export async function envoyerEmailBon({ requestId, pdfBuffer, clientEmail, agentEmail }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('Resend non configuré — email ignoré');
    return { success: false, error: 'Resend non configuré' };
  }
  if (!clientEmail) {
    return { success: false, error: 'Email client manquant sur le compte Firebase' };
  }

  const cc = agentEmail ? [agentEmail] : [];

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FriTok Sourcing <sourcing@fritok.net>',
        to: [clientEmail],
        cc,
        subject: `Votre bon de sourcing FriTok #${requestId.slice(0, 8)}`,
        html: `
          <p>Bonjour,</p>
          <p>Votre demande de sourcing régional a bien été enregistrée sur FriTok.</p>
          <p>Vous trouverez en pièce jointe le récapitulatif détaillé (produits, devis, agent assigné).</p>
          <p>— L'équipe FriTok</p>
        `,
        attachments: [{
          filename: `bon-sourcing-${requestId.slice(0, 8)}.pdf`,
          content: pdfBuffer.toString('base64'),
        }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Resend send error:', data);
      return { success: false, error: data?.message || 'Erreur inconnue' };
    }
    return { success: true, emailId: data.id };
  } catch (e) {
    console.error('envoyerEmailBon:', e);
    return { success: false, error: e.message };
  }
}