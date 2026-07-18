// netlify/functions/submit-sourcing-request.js

import admin from 'firebase-admin';
import { envoyerNotificationAgent } from './_sourcingShared.js';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  try {
    /* ── 1. Authentification ────────────────────────────── */
    const idToken = event.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    }
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    /* ── 2. Validation basique de la requête ────────────── */
    const { items: rawItems } = JSON.parse(event.body || '{}');
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Liste vide' }) };
    }
    if (rawItems.length > 30) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Trop de produits dans une seule demande (max 30)' }) };
    }

    /* ── 3. Revalidation intégrale contre video_playlist ──
       Le client n'a envoyé que { videoId, quantite }. Toute donnée
       affichable (prix, titre, image) est relue ici — jamais celle
       du panier local. Un videoId supprimé/invalide est simplement
       ignoré plutôt que de faire échouer toute la demande.        */
    const items = [];
    for (const raw of rawItems) {
      if (!raw?.videoId) continue;

      const videoSnap = await db.collection('video_playlist').doc(raw.videoId).get();
      if (!videoSnap.exists) continue;

      const p = videoSnap.data().product ?? {};
      const prixUnitaire = Number(p.price) || 0;
      if (prixUnitaire <= 0) continue; // produit sans prix valide → ignoré

      items.push({
        videoId: raw.videoId,
        productId: p.productId ?? '',
        titre: p.name ?? '',
        image: p.thumbnail || p.image || '',
        lienProduit: `https://fritok.net/demo?video=${raw.videoId}`,
        quantite: Math.max(1, Math.min(20, Number(raw.quantite) || 1)), // borné 1-20
        prixUnitaire,
        statutItem: 'a_verifier',
        noteAgent: '',
      });
    }

    if (items.length === 0) {
      return { statusCode: 422, body: JSON.stringify({ error: 'Aucun produit valide dans la liste' }) };
    }

    const sousTotal  = items.reduce((s, i) => s + i.prixUnitaire * i.quantite, 0);
    const totalItems = items.reduce((s, i) => s + i.quantite, 0);

    /* ── 4. Matching agent ───────────────────────────────── */
    const agentsSnap = await db.collection('agent_local_fritok')
      .where('isActive', '==', true)
      .where('verified', '==', true)
      .get();

    const agentsEligibles = agentsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => sousTotal >= (a.minOrder || 0) && sousTotal <= (a.maxOrder || Infinity))
      .sort((a, b) => (b.rating - a.rating) || (b.ordersCompleted - a.ordersCompleted));

    const agent = agentsEligibles[0];
    if (!agent) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: `Aucun agent disponible pour un montant de ${sousTotal.toLocaleString('fr-FR')}. Réduisez ou ajustez votre liste.` }),
      };
    }

    /* ── 5. Calcul du devis — 100% serveur, aucune saisie ── */
    const feeItems   = (agent.feePerItem || 0) * totalItems;
    const commission = Math.round(sousTotal * (agent.commissionPercent || 0) / 100);
    const total       = sousTotal + feeItems + (agent.feePerOrder || 0) + commission + (agent.shippingToClient || 0);

    const devis = {
      sousTotal,
      feeItems,
      feePerOrder: agent.feePerOrder || 0,
      commission,
      shippingToClient: agent.shippingToClient || 0,
      total,
      currency: agent.currency || 'FCFA',
      montantRembourse: 0,
    };

    /* ── 6. Création du "bon" ────────────────────────────── */
    const reqRef = db.collection('sourcing_requests').doc();
    await reqRef.set({
      userId: uid,
      agentId: agent.id,
      items,
      devis,
      statut: 'en_attente_paiement',
      remboursementsEnAttente: [],
      aRemboursementEnAttente: false,
      notifStatus: 'en_attente',
      notifMessageId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    /* ── 7. Notification agent — ne doit jamais faire
       échouer la création de la demande si elle échoue.     */
    const notifResult = await envoyerNotificationAgent(reqRef.id, agent, devis, totalItems);
    await reqRef.update({
      notifStatus: notifResult.success ? 'envoyee' : 'echec',
      notifMessageId: notifResult.messageId ?? null,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        requestId: reqRef.id,
        devis,
        agent: {
          prenom: agent.prenom,
          nom: agent.nom,
          ville: agent.ville,
          pays: agent.pays,
        },
        notifEnvoyee: notifResult.success,
      }),
    };
  } catch (e) {
    console.error('submit-sourcing-request:', e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};