// netlify/functions/_transtet.js
// ─────────────────────────────────────────────────────────────────────────────
// Helper partagé — crée un document dans la collection TransfetMoney.
// Schéma réel observé sur Firestore :
//
//   currency           string   "XOF" | "GHS" | "NGN"
//   date               string   "2026-04-11"  (YYYY-MM-DD)
//   destinataireId     string   UID Firestore du destinataire
//   destinataireNom    string   username / nomBoutique du destinataire
//   destinataireTelephone string téléphone du destinataire
//   expediteurEmail    string   email de l'expéditeur
//   expediteurId       string   UID Firestore de l'expéditeur
//   frais              double   frais de service (0 si aucun)
//   montantEnvoye      double   montant brut envoyé
//   montantRecu        double   montant net reçu (montantEnvoye - frais)
//   profilePictureUrl  string   photoUrl de l'expéditeur (ou "")
//   status             string   "completed" | "pending" | "failed"
//   timestamp          int64    Date.now() (ms)
//   transactionId      string   ID auto du document Firestore
//   type               string   "rental" | "restitution" | "topup" | "transfer"
//
// Usage dans une Netlify Function (ESM) :
//   import { createTranstetEntry } from './_transtet.js';
//   await createTranstetEntry(db, { ... });
//
// ⚠️ Converti en ESM (export au lieu de module.exports) : le package.json
// du projet a "type": "module", donc un fichier .js utilisant
// `module.exports = {...}` ne produit aucun export réellement
// utilisable par un `import {...} from './_transtet.js'` — le nom
// importé se retrouve `undefined` à l'exécution (même symptôme observé
// sur _shared/currency.js et _shared/subscriptionPlans.js pour les
// abonnements, et sur webcreateTopup.js lui-même — voir son propre
// correctif).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formate une date JS en "YYYY-MM-DD"
 */
function toDateString(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/**
 * Crée un document TransfetMoney et retourne son ID.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} opts
 * @param {string}  opts.type              "rental"|"restitution"|"topup"|"transfer"
 * @param {string}  opts.currency          "XOF"|"GHS"|"NGN"
 * @param {number}  opts.montantEnvoye     montant brut (frais inclus)
 * @param {number}  opts.frais             frais de service (0 si wallet)
 * @param {string}  opts.expediteurId      UID de l'utilisateur qui paie/recharge
 * @param {string}  opts.expediteurEmail   email de l'expéditeur
 * @param {string}  opts.expediteurPhoto   photoUrl (peut être "")
 * @param {string}  opts.destinataireId    UID du destinataire (partenaire ou système Fritok)
 * @param {string}  opts.destinataireNom   nom affiché du destinataire
 * @param {string}  opts.destinataireTel   téléphone du destinataire
 * @param {string}  [opts.status]          défaut "completed"
 */
export async function createTranstetEntry(db, opts) {
  const {
    type, currency, montantEnvoye, frais = 0,
    expediteurId, expediteurEmail, expediteurPhoto = '',
    destinataireId, destinataireNom, destinataireTel = '',
    status = 'completed',
  } = opts;

  const now = Date.now();
  const docRef = db.collection('TransfetMoney').doc();
  const txId = docRef.id;

  await docRef.set({
    transactionId: txId,
    type,
    currency,
    date: toDateString(new Date(now)),
    timestamp: now,
    montantEnvoye: Number(montantEnvoye),
    frais: Number(frais),
    montantRecu: Number(montantEnvoye) - Number(frais),
    expediteurId,
    expediteurEmail,
    profilePictureUrl: expediteurPhoto || '',
    destinataireId,
    destinataireNom,
    destinataireTelephone: destinataireTel,
    status,
  });

  return txId;
}