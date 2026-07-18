'use client';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Ticker from '../components/Ticker';
import PhoneShowcase from '../components/PhoneShowcase';
import Stats from '../components/Stats';
import Features from '../components/Features';
import LiveGrid from '../components/LiveGrid';
import LiveBanner from '../components/GoLivebanner';   // ← 🆕 section live marketing
import DeliveryMap from '../components/DeliveryMap';
import TrustBand from '../components/TrustBand';
import CtaBottom from '../components/CtaBottom';
import Footer from '../components/Footer';
import AppBanner from '../components/AppBanner';
import PublishBanner from '../components/PublishBanner';
import PushManager from '../components/PushManager';
import PublierColisBanner from '../components/PublierColisBanner';
import CommandeBanner from '../components/commandes/CommandeBanner'; // ← 🆕 CTA "Mes commandes" → /mes-commandes
import KkiapayBanner from '../components/KkiapayBanner'; // ← 🆕 CTA "Recharger mon wallet" (Mobile Money via KkiaPay)
import CarrieresBanner from '../components/CarrieresBanner'; // ← 🆕 CTA "Rejoignez Made in Benin Live" → /carrieres
import AvatarLiveBanner from '../components/AvatarLiveBanner';
import B2BSupplierBanner from '../components/B2BSupplierBanner'; // ← 🆕 CTA "Devenir fournisseur B2B" → /vendeur/devenir-fournisseur-b2b




export default function Home() {
  return (
    <>
    <PushManager />
      <Navbar />
      <main>
        <Hero />
        <AppBanner />
        <Ticker />
        <PhoneShowcase />
        <Stats />
        <Features />
        <LiveGrid />
        <AvatarLiveBanner />   {/* 🆕 CTA "Lives avatar IA" → /live-avatars/Multilivefeedpage */}
        <PublishBanner />
        <KkiapayBanner />        {/* 🆕 CTA "Recharger mon wallet" → /wallet/topup */}
        <PublierColisBanner />   {/* 🆕 CTA "Publier un colis" → /colis/nouveau */}
        <CommandeBanner />       {/* 🆕 CTA "Mes commandes" → /mes-commandes */}
        <LiveBanner />      {/* ← 🆕 CTA "Vendez en direct" → /live */}
        <CarrieresBanner />      {/* 🆕 CTA "Rejoignez Made in Benin Live" → /carrieres */}
        <B2BSupplierBanner />    {/* 🆕 CTA "Devenir fournisseur B2B" → /vendeur/devenir-fournisseur-b2b */}
        <DeliveryMap />
        <TrustBand />
        <CtaBottom />
      </main>
      <Footer />
    </>
  );
}
