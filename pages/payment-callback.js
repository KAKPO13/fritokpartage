import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function PaymentCallback() {
  const router = useRouter();
  const [status, setStatus] = useState('loading'); // loading, success, error, cancelled
  const [details, setDetails] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;

    const { tx_ref, transaction_id, status: fwStatus } = router.query;

    // 1. Si l'utilisateur a annulé le paiement sur l'interface Flutterwave
    if (fwStatus === 'cancelled') {
      setStatus('cancelled');
      return;
    }

    // 2. Vérification auprès de ton API Backend
    const verifyTransaction = async () => {
      try {
        const response = await fetch(`/api/verify-payment?tx_ref=${tx_ref}&transaction_id=${transaction_id}`);
        const data = await response.json();

        if (response.ok && data.status === 'successful') {
          setDetails(data);
          setStatus('success');
        } else {
          setStatus('error');
        }
      } catch (error) {
        console.error("Erreur de vérification:", error);
        setStatus('error');
      }
    };

    if (tx_ref) {
      verifyTransaction();
    }
  }, [router.isReady, router.query]);

  return (
    <div className="callback-container">
      <div className="status-card">
        {status === 'loading' && (
          <div className="loader-box">
            <div className="spinner"></div>
            <p>Vérification de votre paiement en cours...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="result-box success">
            <div className="icon">✅</div>
            <h1>Paiement Réussi !</h1>
            <p>Votre compte a été crédité avec succès.</p>
            {details && (
              <div className="details">
                <span>Montant : <strong>{details.amount} {details.currency}</strong></span>
                <br />
                <span>Réf : {tx_ref}</span>
              </div>
            )}
            <button onClick={() => router.push('/dashboard')}>Accéder à mon Wallet</button>
          </div>
        )}

        {status === 'cancelled' && (
          <div className="result-box warning">
            <div className="icon">⚠️</div>
            <h1>Paiement Annulé</h1>
            <p>Vous avez interrompu la transaction.</p>
            <button onClick={() => router.push('/recharge')}>Réessayer</button>
          </div>
        )}

        {status === 'error' && (
          <div className="result-box error">
            <div className="icon">❌</div>
            <h1>Échec de la transaction</h1>
            <p>Nous n'avons pas pu confirmer votre paiement. Si vous avez été débité, contactez le support.</p>
            <button onClick={() => router.push('/support')}>Contacter le support</button>
          </div>
        )}
      </div>

      <style jsx>{`
        .callback-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: #f4f7f6;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .status-card {
          background: white;
          padding: 2rem;
          border-radius: 15px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 400px;
          width: 90%;
        }
        .icon { font-size: 3rem; margin-bottom: 1rem; }
        h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #333; }
        p { color: #666; margin-bottom: 1.5rem; }
        .details { background: #f9f9f9; padding: 10px; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.9rem; }
        button {
          background: #0070f3;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
          transition: background 0.3s;
        }
        button:hover { background: #005bc1; }
        .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #0070f3;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}