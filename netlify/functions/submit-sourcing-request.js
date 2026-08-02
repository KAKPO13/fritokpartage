// netlify/functions/submit-sourcing-request.js
//
// Sélection d'agent MANUELLE (décision produit) : le client choisit son
// agent dans la liste des agents éligibles affichée côté client
// (useEligibleAgents dans demo.js), mais cette fonction ne fait JAMAIS
// confiance à ce choix sans le revalider intégralement — l'agent a pu
// devenir inéligible entre l'affichage de la liste et la soumission
// (désactivé, montant qui a changé, devise incompatible).

import admin from 'firebase-admin';
import { creerNotificationAgent } from './_sourcingShared.js';
import { genererPdfBon, envoyerEmailBon } from './_pdfShared.js';

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

// TODO : product.currency n'existe pas encore dans video_playlist. Tant que
// ce champ n'est pas ajouté au flux de publication (idéalement déduit du
// pays du compte vendeur), tout produit est traité comme XOF. Risque connu :
// un produit d'un vendeur GHS/NGN serait comparé et facturé comme s'il
// coûtait le même montant en XOF.
const DEVISE_PAR_DEFAUT = 'XOF';

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
    const { items: rawItems, agentId } = JSON.parse(event.body || '{}');

    if (!agentId || typeof agentId !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'agentId requis — choisissez un agent avant d\'envoyer' }) };
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Liste vide' }) };
    }
    if (rawItems.length > 30) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Trop de produits dans une seule demande (max 30)' }) };
    }

    /* ── 3. Revalidation intégrale contre video_playlist ──
       Le client n'a envoyé que { videoId, quantite }. Toute donnée
       affichable (prix, titre, image) est relue ici — jamais celle du
       panier local. Un videoId supprimé/invalide est simplement ignoré
       plutôt que de faire échouer toute la demande.                   */
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
        currency: p.currency || DEVISE_PAR_DEFAUT,
        statutItem: 'a_verifier',
        noteAgent: '',
      });
    }

    if (items.length === 0) {
      return { statusCode: 422, body: JSON.stringify({ error: 'Aucun produit valide dans la liste' }) };
    }

    /* ── 3bis. Cohérence de devise dans la liste ──────────
       Rejeté plutôt que mélangé silencieusement — un panier ne peut
       porter qu'une seule devise pour l'instant.                     */
    const devisesPresentes = [...new Set(items.map(i => i.currency))];
    if (devisesPresentes.length > 1) {
      return {
        statusCode: 422,
        body: JSON.stringify({
          error: `Votre liste mélange plusieurs devises (${devisesPresentes.join(', ')}). Faites une demande séparée par devise.`,
        }),
      };
    }
    const deviseDemande = devisesPresentes[0];

    const sousTotal  = items.reduce((s, i) => s + i.prixUnitaire * i.quantite, 0);
    const totalItems = items.reduce((s, i) => s + i.quantite, 0);

    /* ── 4. Revalidation de l'agent choisi par le client ──
       Sélection MANUELLE : le serveur ne cherche plus le "meilleur" agent
       lui-même, il vérifie seulement que le choix du client est toujours
       valide au moment de la soumission (l'agent a pu être désactivé,
       le montant a pu changer entre l'affichage de la liste et l'envoi). */
    const agentSnap = await db.collection('agent_local_fritok').doc(agentId).get();
    if (!agentSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Agent introuvable' }) };
    }
    const agent = { id: agentSnap.id, ...agentSnap.data() };

    if (!agent.isActive || !agent.verified) {
      return { statusCode: 422, body: JSON.stringify({ error: 'Cet agent n\'est plus disponible. Choisissez-en un autre.' }) };
    }
    if ((agent.currency || DEVISE_PAR_DEFAUT) !== deviseDemande) {
      return { statusCode: 422, body: JSON.stringify({ error: 'Cet agent ne traite pas cette devise.' }) };
    }
    if (sousTotal < (agent.minOrder || 0) || sousTotal > (agent.maxOrder ?? Infinity)) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: `Le montant (${sousTotal.toLocaleString('fr-FR')} ${deviseDemande}) ne correspond plus aux conditions de cet agent. Choisissez-en un autre.` }),
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
      currency: agent.currency || deviseDemande,
      montantRembourse: 0,
    };

    /* ── 6. Création du "bon" ────────────────────────────── */
    const reqRef = db.collection('sourcing_requests').doc();
    await reqRef.set({
      userId: uid,
      agentId: agent.id,
      agentSelectionMode: 'manuel', // traçabilité — l'agent a été choisi par le client, pas par un algorithme
      // Dénormalisé pour l'affichage client (SourcingClientTracker) sans
      // relecture de agent_local_fritok à chaque rendu.
      agentPrenom: agent.prenom || '',
      agentNom: agent.nom || '',
      agentVille: agent.ville || '',
      agentPays: agent.pays || '',
      items,
      devis,
      statut: 'en_attente_paiement',
      remboursementsEnAttente: [],
      aRemboursementEnAttente: false,
      // Anciennement notifStatus/notifMessageId (WhatsApp) — remplacé par
      // une notification in-app, il n'y a plus de messageId externe.
      notifAgentEnvoyee: false,
      emailStatus: 'en_attente',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    /* ── 7. Notification agent — IN-APP désormais (Firestore),
       ne doit jamais faire échouer la création de la demande si elle échoue. */
    const notifResult = await creerNotificationAgent(db, reqRef.id, agent, devis, totalItems);

    /* ── 8. PDF + email récapitulatif — inchangé, tolérant aux pannes.
       Reste utile comme justificatif téléchargeable/emailé au client,
       indépendant de la notification agent ci-dessus. Si tu n'en as plus
       l'usage, tu peux supprimer ce bloc et les champs emailStatus. */
    let emailResult = { success: false, error: 'Non tenté' };
    try {
      const pdfBuffer = await genererPdfBon(reqRef.id, items, devis, 'manuel');
      emailResult = await envoyerEmailBon({
        requestId: reqRef.id,
        pdfBuffer,
        clientEmail: decoded.email,
        agentEmail: agent.email,
      });
    } catch (e) {
      console.error('Génération/envoi PDF:', e);
      emailResult = { success: false, error: e.message };
    }

    await reqRef.update({
      notifAgentEnvoyee: notifResult.success,
      emailStatus: emailResult.success ? 'envoye' : 'echec',
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
        emailEnvoye: emailResult.success,
      }),
    };
  } catch (e) {
    console.error('submit-sourcing-request:', e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};