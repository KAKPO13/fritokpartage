// netlify/functions/submit-agent-application.js
//
// Ne reçoit PAS le contenu du dossier dans le body : relit
// agent_applications/{uid} (déjà rempli progressivement par le wizard côté
// client via autosave Firestore) pour éviter toute divergence entre ce que
// le client affiche et ce qui est réellement validé.
//
// Ne crée/modifie JAMAIS agent_local_fritok — ça reste une action admin,
// volontairement manuelle (l'admin y ajoute aussi les champs commerciaux :
// commissionPercent, feePerItem, feePerOrder, minOrder, maxOrder,
// shippingToClient, processingDays, shippingDays).

import admin from 'firebase-admin';

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

function erreursValidation(data, decoded) {
  const erreurs = [];
  const i = data.identite || {};
  const a = data.adresse || {};
  const p = data.professionnel || {};
  const b = data.bancaire || {};
  const c = data.confiance || {};
  const ct = data.contrat || {};
  const f = data.formation || {};

  // Niveau 1
  if (!i.pieceIdentiteUrl) erreurs.push("Pièce d'identité manquante");
  if (!i.selfieUrl) erreurs.push('Selfie manquant');
  if (!i.nomComplet) erreurs.push('Nom complet manquant');
  if (!i.dateNaissance) erreurs.push('Date de naissance manquante');
  if (!i.nationalite) erreurs.push('Nationalité manquante');
  if (!i.adresseResidence) erreurs.push('Adresse de résidence manquante');
  if (!i.photoProfilUrl) erreurs.push('Photo de profil manquante');
  if (!decoded.phone_number) erreurs.push('Téléphone du compte non vérifié');
  if (!decoded.email_verified) erreurs.push('Email du compte non vérifié');

  // Niveau 2
  if (!a.justificatifUrl && !a.demandeVisiteGps) erreurs.push('Justificatif de domicile ou visite GPS requis');

  // Niveau 3
  if (p.statut === 'entreprise') {
    if (!p.registreCommerceUrl) erreurs.push('Registre de commerce manquant');
    if (!p.ifuNif) erreurs.push('IFU/NIF manquant');
    if (!p.adresseSiege) erreurs.push('Adresse du siège manquante');
  }

  // Niveau 4
  if (!b.mobileMoney && !b.iban) erreurs.push('Aucun moyen de paiement pour les commissions');
  if (!b.nomTitulaire) erreurs.push('Nom du titulaire bancaire manquant');

  // Niveau 5
  if (c.mode === 'lettre') {
    if (!c.lettreRecommandationUrl) erreurs.push('Lettre de recommandation manquante');
  } else {
    const refsOk = (c.references || []).filter(r => r?.nom && r?.telephone).length >= 2;
    if (!refsOk) erreurs.push('Deux références complètes requises');
  }

  // Niveau 6 — facultatif, aucune validation bloquante

  // Niveau 7
  const clauses = ['cguAcceptees', 'confidentialiteAcceptee', 'anticorruptionAcceptee', 'interdictionArgentDirectAcceptee', 'reglesQualiteAcceptees', 'sanctionsAcceptees'];
  if (clauses.some(cle => !ct[cle])) erreurs.push('Toutes les clauses du contrat doivent être acceptées');
  if (!ct.signatureNom) erreurs.push('Signature électronique manquante');

  // Niveau 8
  if (!f.quizValide) erreurs.push('Questionnaire de formation non validé (score < 80%)');

  // Niveau 9 — facultatif à la soumission, payable après validation admin

  return erreurs;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  try {
    const idToken = event.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
    }
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const appRef = db.collection('agent_applications').doc(uid);
    const appSnap = await appRef.get();
    if (!appSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Aucun dossier trouvé — remplissez le formulaire avant de soumettre' }) };
    }

    const data = appSnap.data();
    if (data.statut && data.statut !== 'brouillon') {
      return { statusCode: 400, body: JSON.stringify({ error: `Dossier déjà ${data.statut === 'soumis' ? 'soumis' : 'traité'}` }) };
    }

    const erreurs = erreursValidation(data, decoded);
    if (erreurs.length > 0) {
      return { statusCode: 422, body: JSON.stringify({ error: erreurs[0], toutesLesErreurs: erreurs }) };
    }

    await appRef.update({
      statut: 'soumis',
      soumisLe: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Pas de système d'admin dédié dans le schéma actuel — un dashboard
    // admin doit simplement lire agent_applications where('statut','==','soumis').
    // À ajouter si besoin : écriture dans une collection 'admin_notifications'
    // ou notification aux comptes ayant un rôle admin.

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (e) {
    console.error('submit-agent-application:', e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};