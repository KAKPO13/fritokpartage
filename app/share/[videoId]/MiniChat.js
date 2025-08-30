'use client';
import React, { useEffect, useState, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import { motion, AnimatePresence } from 'framer-motion';


const bannedWords = [
  "con", "conn", "idiot", "imbécile", "abruti", "stupide", "crétin",
  "merd", "put", "encul", "batard", "bâtard", "salop", "ordur",
  "fdp", "ntm", "nique ta", "va te faire", "chier", "chiant", "branl", "racist", "nègre", "nazi", "antisem", "islamoph", "homophob",
  "sale arabe", "sale noir", "sale blanc", "sale juif", "sale chinois",
  "pédé", "tapette", "gouin", "handicapé", "mongol", "retardé", "porno", "porn", "xxx", "sexe", "s3xe", "suce", "baise", "baiser",
  "fellation", "cul", "chatte", "vagin", "pénis", "zizi", "queue",
  "gode", "sodom", "69", "orgasm", "jouir", "branlette",
  "arnaque", "escroc", "escroquerie", "fraud", "fake", "faux avis",
  "usurp", "hameçonnage", "phishing", "scam", "pirat", "hack", "crack",
  "paypal gratuit", "numéro carte", "cvv", "bitcoin gratuit",
  "visitez mon site", "cliquez ici", "gagnez de l'argent", "travail à domicile",
  "promo", "réduction", "remise", "offre limitée", "parrainage",
  "gagnez", "cashback", "abonnez-vous", "vendre vos données"
];

function generateRandomName() {
  const animals = ['Lion', 'Koala', 'Panda', 'Fox', 'Tiger', 'Otter', 'Zebra', 'Wolf'];
  const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink'];
  const randAnimal = animals[Math.floor(Math.random() * animals.length)];
  const randColor = colors[Math.floor(Math.random() * colors.length)];
  return `${randColor}${randAnimal}${Math.floor(Math.random() * 1000)}`;
}

function containsBannedWords(text) {
  const lowerText = text.toLowerCase();
  return bannedWords.some(word => lowerText.includes(word));
}

export default function MiniChat({ videoId }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      let storedName = localStorage.getItem('chat_username');
      if (!storedName) {
        storedName = generateRandomName();
        localStorage.setItem('chat_username', storedName);
      }
      setUsername(storedName);
    }
  }, []);

  useEffect(() => {
    if (!videoId) return;

    const q = query(collection(db, 'chat_messages'), where('videoId', '==', videoId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(msgs.sort((a, b) => a.timestamp?.seconds - b.timestamp?.seconds));
    });

    return () => unsubscribe();
  }, [videoId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

const sendMessage = async () => {
  if (newMessage.trim() === '') return;

  if (containsBannedWords(newMessage)) {
    alert("🚫 Ton message contient des mots interdits. Merci de rester respectueux.");
    return;
  }

  try {
    const docRef = await addDoc(collection(db, 'chat_messages'), {
      videoId,
      text: newMessage,
      timestamp: serverTimestamp(),
      sender: username,
      replyTo: replyTo?.id || null,
    });

    // 🔁 Mise à jour du champ messageId avec l'ID généré
    await updateDoc(doc(db, 'chat_messages', docRef.id), {
      messageId: docRef.id
    });

    setNewMessage('');
    setReplyTo(null);
  } catch (error) {
    console.error('Erreur envoi message :', error);
    alert("Une erreur est survenue lors de l’envoi du message.");
  }
};

  if (!videoId) {
    return <p>⚠️ Aucun identifiant vidéo fourni. Le chat ne peut pas s’afficher.</p>;
  }

  return (
    <div style={{
      marginTop: '2rem',
      padding: '1rem',
      border: '1px solid #ccc',
      borderRadius: '8px',
      maxWidth: '600px',
      backgroundColor: '#f9f9f9'
    }}>
      <h3>💬 Mini Chat</h3>
      <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem', paddingRight: '0.5rem' }}>
        <AnimatePresence>
          {messages.map((msg) => {
            const replies = messages.filter(m => m.replyTo === msg.id);
            const avatarSeed = encodeURIComponent(msg.sender);

            return (
              <div key={msg.id} style={{ position: 'relative', marginBottom: '1rem' }}>
                {replies.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '40px',
                    left: '16px',
                    width: '2px',
                    height: `${replies.length * 60}px`,
                    backgroundColor: '#ccc',
                    zIndex: 0
                  }} />
                )}

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    backgroundColor: '#fff',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    borderLeft: '4px solid #007E33',
                    position: 'relative',
                    zIndex: 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <img
                      src={`https://api.dicebear.com/7.x/thumbs/svg?seed=${avatarSeed}`}
                      alt="avatar"
                      style={{ width: '32px', height: '32px', borderRadius: '50%', marginRight: '0.5rem' }}
                    />
                    <div>
                      <strong>{msg.sender}:</strong> {msg.text}
                    </div>
                  </div>
                  <button
                    onClick={() => setReplyTo(msg)}
                    style={{
                      marginTop: '0.25rem',
                      fontSize: '0.75rem',
                      background: 'none',
                      border: 'none',
                      color: '#007E33',
                      cursor: 'pointer'
                    }}
                  >
                    ↪ Répondre
                  </button>
                </motion.div>

                {replies.map(reply => (
                  <motion.div
                    key={reply.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{
                      marginLeft: '2rem',
                      marginTop: '0.5rem',
                      backgroundColor: '#eefaf2',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      borderLeft: '3px solid #00b36b',
                      position: 'relative',
                      zIndex: 1
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <img
                        src={`https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(reply.sender)}`}
                        alt="avatar"
                        style={{ width: '28px', height: '28px', borderRadius: '50%', marginRight: '0.5rem' }}
                      />
                      <div>
                        <strong>{reply.sender}:</strong> {reply.text}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            );
          })}
        </AnimatePresence>
        <div ref={chatEndRef} />
      </div>

      {replyTo && (
        <div style={{
          marginBottom: '0.5rem',
          fontStyle: 'italic',
          background: '#e0f7e9',
          padding: '0.5rem',
          borderRadius: '6px'
        }}>
          Répondre à <strong>{replyTo.sender}</strong>: “{replyTo.text}”
          <button onClick={() => setReplyTo(null)} style={{
            marginLeft: '1rem',
            background: 'none',
            border: 'none',
            color: '#d00',
            cursor: 'pointer'
          }}>Annuler</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <input
          type="text"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Écris ton message..."
          style={{
            flex: 1,
            padding: '0.5rem',
            fontSize: '1rem',
            borderRadius: '4px',
            border: '1px solid #ccc'
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            padding: '0.5rem 1rem',
            marginLeft: '0.5rem',
            backgroundColor: '#007E33',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer'
          }}
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}

