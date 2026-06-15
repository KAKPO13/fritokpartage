/** @type {import('next').NextConfig} */
const nextConfig = {
  // Leaflet accesses `window` — ensure it's never processed server-side
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
};

export default nextConfig;


