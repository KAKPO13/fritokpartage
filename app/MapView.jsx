'use client';

import { useEffect, useRef } from 'react';

// Leaflet is loaded client-side only
const D = {
  orange    : '#FF6B00',
  green     : '#1A9640',
  greenLight: '#E6F7EC',
  text1     : '#2D1500',
  text2     : '#8B5E3C',
  amberLight: '#FEF3C7',
  amber     : '#B45309',
};

export default function MapView({ stations = [] }) {
  const mapRef      = useRef(null);
  const leafletRef  = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const init = async () => {
      // Dynamically import Leaflet
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (!mapRef.current || instanceRef.current) return;

      // Fix default marker icon path issue in Next.js
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl      : 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl    : 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      // Default center: Abidjan
      const defaultCenter = [5.3484, -4.0083];

      const map = L.map(mapRef.current, {
        center: defaultCenter,
        zoom  : 13,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom    : 19,
      }).addTo(map);

      instanceRef.current = map;
      leafletRef.current  = L;

      // Try to center on user's position
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            map.setView([lat, lng], 14);

            // Blue dot for user location
            L.circleMarker([lat, lng], {
              radius     : 8,
              fillColor  : '#2196F3',
              color      : '#fff',
              weight     : 2,
              opacity    : 1,
              fillOpacity: 1,
            })
              .addTo(map)
              .bindPopup('<b>Ma position</b>');
          },
          () => {},
          { enableHighAccuracy: true, timeout: 5000 }
        );
      }
    };

    init();

    return () => {
      if (instanceRef.current) {
        instanceRef.current.remove();
        instanceRef.current = null;
      }
    };
  }, []);

  // Add station markers whenever stations prop changes
  useEffect(() => {
    const L   = leafletRef.current;
    const map = instanceRef.current;
    if (!L || !map) return;

    stations.forEach((station) => {
      if (!station.lat || !station.lng) return;

      const available = station.availableCount ?? 0;
      const color     = available > 0 ? D.orange : '#aaa';

      // Custom icon
      const icon = L.divIcon({
        className : '',
        html      : `
          <div style="
            width:36px; height:36px; border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            background:${color};
            border:3px solid #fff;
            box-shadow:0 2px 6px rgba(0,0,0,0.30);
            display:flex; align-items:center; justify-content:center;
          ">
            <span style="transform:rotate(45deg); font-size:14px;">⚡</span>
          </div>`,
        iconSize  : [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36],
      });

      L.marker([station.lat, station.lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:sans-serif; min-width:160px;">
            <div style="font-size:13px; font-weight:700; color:${D.text1}; margin-bottom:4px;">
              ${station.name || station.id}
            </div>
            <div style="font-size:12px; color:${D.text2}; margin-bottom:8px;">
              ${station.address || ''}
            </div>
            <div style="
              display:inline-block; padding:3px 8px; border-radius:99px;
              background:${available > 0 ? '#E6F7EC' : '#f5f5f5'};
              color:${available > 0 ? D.green : '#888'};
              font-size:11px; font-weight:700;
            ">
              ${available > 0 ? `${available} power bank${available > 1 ? 's' : ''} dispo` : 'Aucun disponible'}
            </div>
          </div>
        `);
    });
  }, [stations]);

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: '100%', minHeight: 300 }}
    />
  );
}
