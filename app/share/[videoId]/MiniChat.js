'use client';
import React, { useEffect, useState, useRef } from 'react';
import { collection, addDoc, query, where, onSnapshot, getFirestore, serverTimestamp } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { motion, AnimatePresence } from 'framer-motion';

const firebaseConfig = {
  apiKey: "AIzaSyDKKayop62AaoC5DnYz5UuDpJIT3RBRX3M",
  authDomain: "cgsp-app.firebaseapp.com",
  projectId: "cgsp-app",
  storageBucket: "cgsp-app.appspot.com",
  messagingSenderId: "463987328508",
  appId: "1:463987328508:android:829287eef68a37af739e79"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function generateRandomName() {
  const animals = ['Lion', 'Koala', 'Panda', 'Fox', 'Tiger', 'Otter', 'Zebra', 'Wolf'];
  const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink'];
  const randAnimal = animals[Math.floor(Math.random() * animals.length)];
  const randColor = colors[Math.floor(Math.random() * colors.length)];
  return `${randColor}${randAnimal}${Math.floor(Math.random() * 1000)}`;
}

export default function MiniChat({ videoId }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    let storedName = localStorage.getItem('chat_username');
    if (!storedName) {
      storedName = generateRandomName();
      localStorage.setItem('chat_username', storedName);
    }
    setUsername(storedName);
  }, []);

  useEffect(() => {
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

    try {
      await addDoc(collection(db, 'chat_messages'), {
        videoId,
        text: newMessage,
        timestamp: serverTimestamp(),
        sender: username,
      });
      setNewMessage('');
    } catch (error) {
      console.error('Erreur envoi message :', error);
    }
  };

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
      <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '1rem', paddingRight: '0.5rem' }}>
        <AnimatePresence>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '0.5rem',
                backgroundColor: '#fff',
                padding: '0.5rem',
                borderRadius: '6px'
              }}
            >
              <img
                src={`https://api.dicebear.com/7.x/thumbs/svg?seed=${msg.sender}`}
                alt="avatar"
                style={{ width: '32px', height: '32px', borderRadius: '50%', marginRight: '0.5rem' }}
              />
              <div>
                <strong>{msg.sender}:</strong> {msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={chatEndRef} />
      </div>
      <div style={{ display: 'flex' }}>
        <input
          type="text"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Écris ton message..."
          style={{ flex: 1, padding: '0.5rem' }}
        />
        <button onClick={sendMessage} style={{
          padding: '0.5rem 1rem',
          marginLeft: '0.5rem',
          backgroundColor: '#007E33',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Envoyer
        </button>
      </div>
    </div>
  );
}

