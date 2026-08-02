// scripts/migrer-agents.js
//
// Renomme les champs avec suffixe FCFA vers leur nom sans suffixe, sur
// TOUS les documents de agent_local_fritok. Mode dry-run par défaut —
// ajoute --apply pour exécuter réellement les changements.
//
// Usage :
//   node scripts/migrer-agents.js            (aperçu, aucune écriture)
//   node scripts/migrer-agents.js --apply    (exécute la migration)

import admin from 'firebase-admin';
import { config } from 'dotenv';
config({ path: '.env.local' });

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

// Mapping ancien nom → nouveau nom. Ajoute ici toute autre variante que
// tu découvrirais sur d'autres documents mal saisis.
const RENOMMAGES = {
  minOrderFCFA: 'minOrder',
  maxOrderFCFA: 'maxOrder',
  feePerItemFCFA: 'feePerItem',
  feePerOrderFCFA: 'feePerOrder',
  shippingToClientFCFA: 'shippingToClient',
};

const APPLY = process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('agent_local_fritok').get();

  if (snap.empty) {
    console.log('Aucun document dans agent_local_fritok.');
    return;
  }

  let docsATraiter = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const update = {};
    const champsRenommes = [];

    for (const [ancien, nouveau] of Object.entries(RENOMMAGES)) {
      if (Object.prototype.hasOwnProperty.call(data, ancien)) {
        update[nouveau] = data[ancien];
        update[ancien] = admin.firestore.FieldValue.delete();
        champsRenommes.push(`${ancien} → ${nouveau} (${data[ancien]})`);
      }
    }

    if (champsRenommes.length === 0) {
      console.log(`✓ ${doc.id} (${data.nom || '?'}) — déjà correct, rien à faire.`);
      continue;
    }

    docsATraiter++;
    console.log(`\n${doc.id} (${data.nom || '?'} ${data.prenom || ''}) :`);
    champsRenommes.forEach(c => console.log(`  - ${c}`));

    // Avertissement séparé pour le champ email, non couvert par ce
    // renommage automatique — à ajouter manuellement si absent.
    if (!data.email) {
      console.log('  ⚠ Champ "email" absent — à ajouter manuellement (nécessaire pour la copie du PDF sourcing).');
    }

    if (APPLY) {
      await doc.ref.update(update);
      console.log('  → Appliqué.');
    }
  }

  console.log(`\n${docsATraiter} document(s) à migrer sur ${snap.size} au total.`);

  if (!APPLY && docsATraiter > 0) {
    console.log('\nAucune écriture effectuée (mode aperçu). Relance avec --apply pour appliquer réellement.');
  }
}

main().catch(e => {
  console.error('Erreur migration:', e);
  process.exit(1);
});