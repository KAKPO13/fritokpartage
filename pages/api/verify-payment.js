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
    const { data: existingPayment, error: fetchError } = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/pending_payments?tx_ref=eq.${tx_ref}&select=*`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    ).then(r => r.json());

    if (!existingPayment || existingPayment.length === 0) {
      return res.status(404).json({ error: "Transaction introuvable dans la base de données" });
    }

    const payment = existingPayment[0];
    if (payment.status === "successful") {
      return res.status(200).json({ status: "successful", amount: payment.amount, currency: payment.currency });
    }

    // 2. Vérification externe Flutterwave
    const fwResp = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
      }
    );
    const fwData = await fwResp.json();

    if (fwData.status === "success" && fwData.data.status === "successful") {
      const transaction = fwData.data;
      const paidAmount = parseFloat(transaction.amount);
      const expectedAmount = parseFloat(payment.amount);

      if (paidAmount >= expectedAmount && transaction.currency === payment.currency) {
        // Mise à jour atomique via RPC REST
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/increment_wallet_balance`, {
          method: "POST",
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_user_id: payment.user_id,
            p_amount: paidAmount,
            p_tx_ref: tx_ref,
          }),
        });

        // Mise à jour finale
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/pending_payments?tx_ref=eq.${tx_ref}`, {
          method: "PATCH",
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "successful",
            flutterwave_id: transaction.id,
            updated_at: new Date().toISOString(),
          }),
        });

        return res.status(200).json({ status: "successful", amount: paidAmount, currency: transaction.currency });
      } else {
        return res.status(400).json({ error: "Fraude détectée : Montant ou devise incorrect" });
      }
    } else {
      const currentFwStatus = fwData.data?.status || "failed";
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/pending_payments?tx_ref=eq.${tx_ref}`, {
        method: "PATCH",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: currentFwStatus }),
      });

      return res.status(200).json({ status: currentFwStatus });
    }
  } catch (err) {
    console.error("Verify-Payment Error:", err.message);
    return res.status(500).json({ error: "Erreur interne", message: err.message });
  }
}
