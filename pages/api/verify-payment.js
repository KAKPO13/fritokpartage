const { createClient } = require("@supabase/supabase-js");
const fetch = require("node-fetch");

// Initialisation de Supabase avec la Service Role Key (Admin)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  // 1. Gestion des méthodes HTTP
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Extraction de la référence tx_ref
  const tx_ref = event.queryStringParameters?.tx_ref || 
                 (event.body ? JSON.parse(event.body).tx_ref : null);

  if (!tx_ref) {
    return { 
      statusCode: 400, 
      body: JSON.stringify({ error: "Référence de transaction manquante (tx_ref)" }) 
    };
  }

  try {
    // 2. Vérification locale dans Supabase
    const { data: existingPayment, error: fetchError } = await supabase
      .from("pending_payments")
      .select("*")
      .eq("tx_ref", tx_ref)
      .single();

    if (fetchError || !existingPayment) {
      return { statusCode: 404, body: JSON.stringify({ error: "Transaction introuvable dans la base de données" }) };
    }

    // Si déjà validé, on renvoie le succès immédiatement sans re-créditer
    if (existingPayment.status === "successful") {
      return { 
        statusCode: 200, 
        body: JSON.stringify({ 
          status: "successful", 
          amount: existingPayment.amount, 
          currency: existingPayment.currency,
          message: "Transaction déjà traitée." 
        }) 
      };
    }

    // 3. Vérification externe auprès de Flutterwave
    const response = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const fwData = await response.json();

    // 4. Validation stricte de la réponse Flutterwave
    if (fwData.status === "success" && fwData.data.status === "successful") {
      const transaction = fwData.data;

      // Sécurité : Vérifier que le montant payé correspond au montant attendu
      // On utilise parseFloat pour s'assurer d'une comparaison numérique correcte
      const paidAmount = parseFloat(transaction.amount);
      const expectedAmount = parseFloat(existingPayment.amount);

      if (paidAmount >= expectedAmount && transaction.currency === existingPayment.currency) {
        
        // 5. MISE À JOUR ATOMIQUE VIA RPC
        // On appelle la fonction SQL qui gère : 
        // - La mise à jour du solde dans 'wallets'
        // - La création d'une ligne dans 'wallet_transactions'
        // - Le changement de statut dans 'pending_payments'
        
        const { error: rpcError } = await supabase.rpc('increment_wallet_balance', {
          p_user_id: existingPayment.user_id,
          p_amount: paidAmount,
          p_tx_ref: tx_ref
        });

        if (rpcError) {
          console.error("Erreur lors de l'exécution du RPC:", rpcError);
          throw new Error("Erreur lors de la mise à jour du solde utilisateur.");
        }

        // 6. Mise à jour finale de la table pending_payments (pour historique)
        await supabase
          .from("pending_payments")
          .update({ 
            status: "successful",
            flutterwave_id: transaction.id,
            updated_at: new Date().toISOString()
          })
          .eq("tx_ref", tx_ref);

        return {
          statusCode: 200,
          body: JSON.stringify({
            status: "successful",
            amount: paidAmount,
            currency: transaction.currency
          }),
        };
      } else {
        return { 
          statusCode: 400, 
          body: JSON.stringify({ error: "Fraude détectée : Montant ou devise incorrect" }) 
        };
      }
    } else {
      // Cas où Flutterwave confirme que c'est un échec ou en attente
      const currentFwStatus = fwData.data?.status || "failed";
      
      if (currentFwStatus === "failed" || currentFwStatus === "cancelled") {
          await supabase.from("pending_payments").update({ status: currentFwStatus }).eq("tx_ref", tx_ref);
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ status: currentFwStatus }),
      };
    }
  } catch (err) {
    console.error("Verify-Payment Error:", err.message);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: "Erreur interne", message: err.message }) 
    };
  }
};