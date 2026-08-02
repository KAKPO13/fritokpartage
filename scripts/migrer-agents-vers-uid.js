// scripts/migrer-agents-vers-uid.js
//
// Recrée chaque document de agent_local_fritok avec pour ID le uid
// Firebase Auth de l'agent correspondant (au lieu de son ID actuel),
// pour permettre une lecture directe doc(db, 'agent_local_fritok', uid)
// depuis app/sourcing/AgentDashboard/page.js — au lieu d'une query.
//
// Aucun champ ne relie aujourd'hui un document agent_local_fritok à un
// uid. Le script tente donc une correspondance automatique par numéro
// de téléphone (agent.whatsapp ↔ users.phone, normalisés). Pour les cas
// ambigus (plusieurs utilisateurs avec le même téléphone) ou non
// trouvés, complète MAPPING_MANUEL ci-dessous après vérification dans
// la console Firebase, puis relance.
//
// Mode dry-run par défaut — ajoute --apply pour exécuter réellement.
//
// Usage :
//   node scripts/migrer-agents-vers-uid.js            (aperçu, aucune écriture)
//   node scripts/migrer-agents-vers-uid.js --apply     (exécute la migration)

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

const APPLY = process.argv.includes('--apply');

// Complète ici les correspondances non résolues automatiquement :
// { idDocumentActuelDansAgentLocalFritok: 'uidFirebaseAuthCorrect' }
const MAPPING_MANUEL = {
  // 'AbCdEf12345': 'L1h3DUUD9HN9lUzejk2Wgy3VTNC2',
};

// Normalise un numéro pour comparaison : garde les chiffres, retire le
// préfixe international (225 / 00225) et le zéro initial éventuel.
function normaliserTel(tel) {
  if (!tel) return null;
  const chiffres = tel.replace(/\D/g, '');
  return chiffres.replace(/^(00225|225)?0?/, '');
}

async function chargerUsersAgents() {
  const snap = await db.collection('users').where('isAgent', '==', true).get();
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

async function main() {
  const agentsSnap = await db.collection('agent_local_fritok').get();

  if (agentsSnap.empty) {
    console.log('Aucun document dans agent_local_fritok.');
    return;
  }

  const usersAgents = await chargerUsersAgents();
  console.log(`${usersAgents.length} utilisateur(s) avec isAgent=true dans users.\n`);

  const idsExistants = new Set(agentsSnap.docs.map(d => d.id));

  let migres = 0, dejaCorrects = 0, nonResolus = 0, collisions = 0;

  for (const doc of agentsSnap.docs) {
    const data = doc.data();
    const label = `${data.nom || '?'} ${data.prenom || ''}`.trim();

    // Déjà migré : l'ID du doc est déjà l'uid d'un utilisateur isAgent=true.
    if (usersAgents.some(u => u.uid === doc.id)) {
      console.log(`✓ ${doc.id} (${label}) — déjà sur le bon uid, rien à faire.`);
      dejaCorrects++;
      continue;
    }

    // 1. Mapping manuel prioritaire
    let uidTrouve = MAPPING_MANUEL[doc.id] || null;
    let methode = uidTrouve ? 'mapping manuel' : null;

    // 2. Correspondance automatique par téléphone (whatsapp ↔ phone)
    if (!uidTrouve && data.whatsapp) {
      const telAgent = normaliserTel(data.whatsapp);
      const correspondances = usersAgents.filter(
        u => u.phone && normaliserTel(u.phone) === telAgent
      );
      if (correspondances.length === 1) {
        uidTrouve = correspondances[0].uid;
        methode = `téléphone (${data.whatsapp} ↔ ${correspondances[0].phone})`;
      } else if (correspondances.length > 1) {
        console.log(`⚠ ${doc.id} (${label}) — ${correspondances.length} utilisateurs partagent ce téléphone (${data.whatsapp}). Ajoute une entrée dans MAPPING_MANUEL.`);
        nonResolus++;
        continue;
      }
    }

    if (!uidTrouve) {
      console.log(`✗ ${doc.id} (${label}) — aucune correspondance trouvée (whatsapp: ${data.whatsapp || '—'}). Ajoute une entrée dans MAPPING_MANUEL.`);
      nonResolus++;
      continue;
    }

    // Évite d'écraser un document déjà présent sous cet uid.
    if (idsExistants.has(uidTrouve)) {
      console.log(`⚠ ${doc.id} (${label}) → ${uidTrouve} — un document existe déjà sous cet uid, migration ignorée (à traiter manuellement).`);
      collisions++;
      continue;
    }

    console.log(`\n${doc.id} (${label}) → ${uidTrouve}`);
    console.log(`  - trouvé via ${methode}`);
    migres++;

    if (APPLY) {
      const nouvelleRef = db.collection('agent_local_fritok').doc(uidTrouve);
      await nouvelleRef.set({ ...data, uid: uidTrouve });
      await doc.ref.delete();
      console.log('  → Appliqué (ancien document supprimé).');
    }
  }

  console.log(
    `\n${migres} document(s) migré(s) ou à migrer, ${dejaCorrects} déjà correct(s), ` +
    `${nonResolus} non résolu(s), ${collisions} collision(s) évitée(s), sur ${agentsSnap.size} au total.`
  );

  if (!APPLY && migres > 0) {
    console.log('\nAucune écriture effectuée (mode aperçu). Relance avec --apply pour appliquer réellement.');
  }
}

main().catch(e => {
  console.error('Erreur migration:', e);
  process.exit(1);
});