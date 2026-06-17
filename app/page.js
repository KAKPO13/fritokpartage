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
import GoLivePage from '../../components/GoLivePage';



export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <AppBanner />
        <Ticker />
        <PhoneShowcase />
        <Stats />
        <Features />
        <LiveGrid />
        <LiveBanner />      {/* ← 🆕 CTA "Vendez en direct" → /live */}
        <DeliveryMap />
        <TrustBand />
        <CtaBottom />
      </main>
      <Footer />
    </>
  );
}
