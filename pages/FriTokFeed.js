import React, { useState, useEffect, useRef } from "react";
import { firestore, auth } from "./firebase"; // Assure-toi d’avoir configuré Firebase
import VideoPlayer from "./VideoPlayer"; // Composant personnalisé
import ProductOverlay from "./ProductOverlay"; // Infos produit + bouton achat
import ChatBox from "./ChatBox"; // Chat en direct
import CartBadge from "./CartBadge"; // Badge panier
import EmojiOverlay from "./EmojiOverlay"; // Animation emoji
import { speak } from "./voiceUtils"; // Utilitaire synthèse vocale

export default function FriTokFeed({ playlist }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const feedRef = useRef(null);

  // Navigation verticale
  const handleScroll = (e) => {
    const direction = e.deltaY > 0 ? 1 : -1;
    setCurrentIndex((prev) =>
      Math.max(0, Math.min(playlist.length - 1, prev + direction))
    );
  };

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.addEventListener("wheel", handleScroll);
    return () => feed && feed.removeEventListener("wheel", handleScroll);
  }, []);

  // Synthèse vocale de bienvenue
  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      const name = user.displayName || "utilisateur";
      speak(`Bienvenue ${name} dans FriTok, votre partenaire commercial`);
    }
  }, []);

  const currentVideo = playlist[currentIndex];

  return (
    <div ref={feedRef} className="fritok-feed">
      {playlist.map((video, index) => (
        <div
          key={video.id}
          className={`video-slide ${index === currentIndex ? "active" : "inactive"}`}
        >
          <VideoPlayer src={video.url} autoPlay={index === currentIndex} />
          <ProductOverlay product={video.product} sellerId={video.userId} />
          <ChatBox videoId={video.id} />
          <CartBadge />
          <EmojiOverlay trigger={video.id} />
        </div>
      ))}
    </div>
  );
}
