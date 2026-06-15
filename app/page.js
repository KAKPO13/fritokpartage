'use client';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Ticker from '../components/Ticker';
import PhoneShowcase from '../components/PhoneShowcase';
import Stats from '../components/Stats';
import Features from '../components/Features';
import LiveGrid from '../components/LiveGrid';
import TrustBand from '../components/TrustBand';
import CtaBottom from '../components/CtaBottom';
import Footer from '../components/Footer';
import AppBanner from '../components/AppBanner';

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
        <TrustBand />
        <CtaBottom />
      </main>
      <Footer />
    </>
  );
}
