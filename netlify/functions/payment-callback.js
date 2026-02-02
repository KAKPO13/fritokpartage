import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function PaymentCallback() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [statusType, setStatusType] = useState('info'); // 'info', 'success', 'error'
  const [message, setMessage] = useState("Initialisation de la vérification...");

  useEffect(() => {
    // 1. Attendre que le routeur soit prêt pour lire les paramètres d'URL
    if (!router.isReady) return;

    const { tx_ref, transaction_id, status } = router.query;

    // 2. Si Flutterwave renvoie explicitement une annulation
    if (status === 'cancelled') {
      setMessage("Vous avez annulé la transaction.");
      setStatusType('error');
      setLoading(false);
      return;
    }

    if (tx_ref) {
      verifyPayment(tx_ref, transaction_id);
    } else {
      setMessage("Référence de transaction introuvable.");
      setStatusType('error');
      setLoading(false);
    }
  }, [router.isReady, router.query]);

  const verifyPayment = async (ref, id) => {
    try {
      setLoading(true);
      setMessage("Vérification sécurisée auprès de Flutterwave...");

      // Appel de ta fonction backend (verify-payment.js)
      const response = await axios.get(`/api/verify-payment`, {
        params: { tx_ref: ref, transaction_id: id }
      });

      if (response.data.status === "successful") {
        setMessage(`Paiement réussi ! ${response.data.amount} ${response.data.currency} ont été ajoutés à votre solde.`);
        setStatusType('success');
      } else {
        setMessage("Le paiement n'a pas pu être validé. Statut : " + (response.data.status || "inconnu"));
        setStatusType('error');
      }
    } catch (error) {
      console.error("Erreur Callback:", error);
      setMessage("Une erreur est survenue lors de la validation du paiement.");
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconBox}>
          {loading ? (
            <div className="spinner" style={styles.spinner}></div>
          ) : statusType === 'success' ? (
            <span style={{ fontSize: '50px' }}>✅</span>
          ) : (
            <span style={{ fontSize: '50px' }}>❌</span>
          )}
        </div>

        <h1 style={styles.title}>
          {loading ? "Vérification en cours" : statusType === 'success' ? "Succès !" : "Oups !"}
        </h1>
        
        <p style={{ ...styles.message, color: statusType === 'error' ? '#d9534f' : '#333' }}>
          {message}
        </p>

        {!loading && (
          <button 
            onClick={() => router.push('/dashboard')} 
            style={styles.button}
            onMouseOver={(e) => e.target.style.backgroundColor = '#0056b3'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#007bff'}
          >
            Retour au Dashboard
          </button>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #007bff;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}

// Styles basiques intégrés
const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f8f9fa',
    padding: '20px'
  },
  card: {
    backgroundColor: '#ffffff',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
    maxWidth: '450px',
    width: '100%',
    textAlign: 'center'
  },
  iconBox: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '20px'
  },
  title: {
    fontSize: '24px',
    marginBottom: '15px',
    color: '#2c3e50'
  },
  message: {
    fontSize: '16px',
    lineHeight: '1.5',
    marginBottom: '30px'
  },
  button: {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    padding: '12px 25px',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  }
};