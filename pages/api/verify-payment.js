// pages/api/verify-payment.js (ESM)
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const tx_ref = req.query.tx_ref || (req.body ? req.body.tx_ref : null);
  if (!tx_ref) {
    return res.status(400).json({ error: "Référence de transaction manquante (tx_ref)" });
  }

  try {
    // 1. Vérification locale via REST Supabase
    const resp = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/pending_payments?tx_ref=eq.${tx_ref}&select=*`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!resp.ok) {
      return res.status(500).json({ error: "Erreur Supabase", status: resp.status });
    }

    const existingPayment = await resp.json();
    if (!existingPayment || existingPayment.length === 0) {
      return res.status(404).json({ error: "Transaction introuvable dans la base de données" });
    }

    const payment = existingPayment[0];
    if (payment.status === "successful") {
      return res.status(200).json({
        status: "successful",
        amount: payment.amount,
        currency: payment.currency,
      });
    }

    // 2. Vérification externe Flutterwave
    const fwResp = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
      }
    );

    if (!fwResp.ok) {
      return res.status(500).json({ error: "Erreur Flutterwave", status: fwResp.status });
    }

    const fwData = await fwResp.json();

    if (fwData.status === "success" && fwData.data.status === "successful") {
      const transaction = fwData.data;
      const paidAmount = Math.round(parseFloat(transaction.amount) * 100); // en centimes
      const expectedAmount = Math.round(parseFloat(payment.amount) * 100);

      if (paidAmount >= expectedAmount && transaction.currency === payment.currency) {
        // 3. Mise à jour atomique via RPC unique
        const rpcResp = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/verify_and_increment`,
          {
            method: "POST",
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_KEY,
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_user_id: payment.user_id,
              p_amount: paidAmount / 100, // retour en unité
              p_tx_ref: tx_ref,
              p_flutterwave_id: transaction.id,
              p_currency: transaction.currency,
            }),
          }
        );

        if (!rpcResp.ok) {
          return res.status(500).json({ error: "Erreur RPC Supabase", status: rpcResp.status });
        }

        return res.status(200).json({
          status: "successful",
          amount: paidAmount / 100,
          currency: transaction.currency,
        });
      } else {
        return res.status(400).json({ error: "Fraude détectée : Montant ou devise incorrect" });
      }
    } else {
      const currentFwStatus = fwData.data?.status || "failed";

      // Mise à jour du statut en base
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/pending_payments?tx_ref=eq.${tx_ref}`, {
        method: "PATCH",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: currentFwStatus, updated_at: new Date().toISOString() }),
      });

      return res.status(200).json({ status: currentFwStatus });
    }
  } catch (err) {
    console.error("Verify-Payment Error:", err.message);
    return res.status(500).json({ error: "Erreur interne", message: err.message });
  }
}
