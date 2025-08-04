'use client';

import { useState } from 'react';
import BuyPageClient from './BuyPageClient';
import OrderConfirmation from '../OrderConfirmation'; // adapte le chemin si nécessaire

export default function BuyPageWithConfirmation(props) {
  const [showConfirmation, setShowConfirmation] = useState(false);

  return (
    <div>
      <BuyPageClient {...props} />

      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <button
          onClick={() => setShowConfirmation(true)}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#2196f3',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          📦 Confirmer la commande
        </button>
      </div>

      {showConfirmation && (
        <OrderConfirmation
          title={props.title}
          price={props.price}
          thumbnail={props.thumbnail}
          token={props.token}
        />
      )}
    </div>
  );
}
