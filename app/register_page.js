'use client';

import React, { useState } from "react";
import { db, auth } from "../lib/firebaseClient";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("Client");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+33");
  const [address, setAddress] = useState("");
  const [shopName, setShopName] = useState("");
  const [loading, setLoading] = useState(false);
  const [cgu, setCgu] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  // 🔐 Devise principale selon pays
  const getCurrencyByCountry = (code) => {
    switch (code) {
      case '+229': // Bénin
      case '+228': // Togo
      case '+225': // Côte d'Ivoire
      case '+221': // Sénégal
        return 'XOF';
      case '+233': // Ghana
        return 'GHS';
      case '+234': // Nigeria
        return 'NGN';
      default:
        return 'XOF';
    }
  };

  const register = async () => {
    if (!email || !password || !username) {
      alert("Remplissez tous les champs requis");
      return;
    }

    if (!cgu || !privacy) {
      alert("Veuillez accepter les CGU et la politique de confidentialité");
      return;
    }

    setLoading(true);

    try {
      // 1️⃣ Crée l'utilisateur Firebase
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // 2️⃣ Envoie email de vérification
      await sendEmailVerification(cred.user);

      // 3️⃣ Prépare données Firestore
      const vendorId = role === "Vendeur"
        ? `VEND-${Date.now()}`
        : null;

      const currency = getCurrencyByCountry(countryCode);

      await setDoc(doc(db, "users", cred.user.uid), {
        userId: cred.user.uid,
        email,
        username,
        phone: `${countryCode}${phone}`,
        role, // Client, Vendeur, Livreur
        nomBoutique: shopName,
        adresse: address,
        id_boutique: vendorId,
        wallet: { XOF: 0, GHS: 0, NGN: 0 },
        currency,
        photoUrl: null,
        location: null,
        fcmToken: null,
        flutterwave_subaccount_id: null,
        kyc_status: role === "Vendeur" ? "pending" : "none",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert("Compte créé ! Vérifiez votre email.");
      router.push("/verify_email_page");

    } catch (e) {
      console.error(e);
      alert("Erreur : " + e.message);
    }

    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 420, margin: "50px auto", padding: 24 }}>
      <h1>Créer un compte</h1>

      <div style={{ marginBottom: 12 }}>
        <label>Nom d'utilisateur</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Ex: JeanDupont"
          style={{ width: "100%", padding: 8 }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="exemple@domain.com"
          style={{ width: "100%", padding: 8 }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Mot de passe</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min 6 caractères"
          style={{ width: "100%", padding: 8 }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Rôle</label>
        <select value={role} onChange={e => setRole(e.target.value)} style={{ width: "100%", padding: 8 }}>
          <option value="Client">Client</option>
          <option value="Livreur">Livreur</option>
          <option value="Vendeur">Vendeur</option>
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Pays / Code</label>
        <input
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          style={{ width: 60, padding: 8, marginRight: 8 }}
        />
        <label>Numéro</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ width: "calc(100% - 68px)", padding: 8 }}
        />
      </div>

      {role !== "Client" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label>Nom de la boutique</label>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Adresse de la boutique</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
        </>
      )}

      <div style={{ marginBottom: 12 }}>
        <label>
          <input type="checkbox" checked={cgu} onChange={e => setCgu(e.target.checked)} />
          J'accepte les CGU
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <input type="checkbox" checked={privacy} onChange={e => setPrivacy(e.target.checked)} />
          J'accepte la politique de confidentialité
        </label>
      </div>

      <button
        onClick={register}
        disabled={loading}
        style={{
          width: "100%",
          padding: 12,
          fontSize: 16,
          backgroundColor: "#ff6600",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: loading ? "not-allowed" : "pointer"
        }}
      >
        {loading ? "Création..." : "Créer un compte"}
      </button>
    </div>
  );
}
