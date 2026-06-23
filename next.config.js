// next.config.js
import withPWA from 'next-pwa';

const withPWACustom = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // ⚡ Ajout du pré-cache des routes critiques
  runtimeCaching: [
    {
      urlPattern: /^\/$/, // page d'accueil
      handler: 'CacheFirst',
      options: {
        cacheName: 'homepage-cache',
        expiration: { maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /^\/produits/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'produits-cache',
        expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /^\/checkout/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'checkout-cache',
        expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
  ],
});

const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Leaflet utilise `window` → éviter le traitement côté serveur
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
};

export default withPWACustom(nextConfig);
