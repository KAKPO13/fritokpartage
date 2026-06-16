'use client';
import { useEffect, useRef } from 'react';

const D = {
  orange: '#FF6B00', green: '#1A9640', text1: '#2D1500', text2: '#8B5E3C',
  amber: '#B45309', red: '#E53E00',
};

// Couleur selon l'état du power bank
function stateColor(state) {
  if (state === 'disponible')  return D.orange;
  if (state === 'en_location') return '#888';
  return D.red; // hors_service
}

function batteryColor(level) {
  if (level == null || level >= 60) return D.green;
  if (level >= 30) return D.amber;
  return D.red;
}

export default function MapView({ powerBanks = [] }) {
  const mapRef      = useRef(null);
  const mapInstance = useRef(null); // Leaflet map instance
  const L           = useRef(null); // Leaflet lib
  const markersRef  = useRef([]);   // track added markers for cleanup

  // ── Init map once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let destroyed = false;

    (async () => {
      // Load Leaflet + CSS
      const leaflet = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (destroyed || !mapRef.current || mapInstance.current) return;

      // Fix broken default icon paths in Next.js/webpack
      delete leaflet.Icon.Default.prototype._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl      : 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl    : 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      const map = leaflet.map(mapRef.current, {
        center: [5.3484, -4.0083], // Abidjan par défaut
        zoom  : 13,
        zoomControl: true,
      });

      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom    : 19,
      }).addTo(map);

      mapInstance.current = map;
      L.current           = leaflet;

      // Géolocalisation utilisateur
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            if (destroyed) return;
            map.setView([coords.latitude, coords.longitude], 14);
            leaflet.circleMarker([coords.latitude, coords.longitude], {
              radius: 8, fillColor: '#2196F3', color: '#fff',
              weight: 2, opacity: 1, fillOpacity: 1,
            }).addTo(map).bindPopup('<b>📍 Ma position</b>');
          },
          () => {}, // permission refusée → reste sur Abidjan
          { enableHighAccuracy: true, timeout: 6000 },
        );
      }

      // Une fois la carte prête, ajouter les marqueurs déjà disponibles
      if (powerBanks.length > 0) addMarkers(map, leaflet, powerBanks);
    })();

    return () => {
      destroyed = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        L.current           = null;
        markersRef.current  = [];
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // une seule fois

  // ── Mise à jour des marqueurs quand powerBanks change ───────────────────
  useEffect(() => {
    if (!mapInstance.current || !L.current) return;
    // Supprimer les anciens marqueurs
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    addMarkers(mapInstance.current, L.current, powerBanks);
  }, [powerBanks]);

  return (
    <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: 400 }} />
  );
}

// ── Fonction utilitaire : ajoute les marqueurs sur la carte ───────────────
function addMarkers(map, leaflet, powerBanks) {
  const added = [];

  powerBanks.forEach((pb) => {
    // Sécurité : GeoPoint peut arriver sous forme d'objet Firestore
    const lat = pb.lat ?? pb.location?.latitude;
    const lng = pb.lng ?? pb.location?.longitude;
    if (lat == null || lng == null) return;

    const color   = stateColor(pb.state);
    const battery = pb.batteryLevel;
    const isDispo = pb.state === 'disponible';

    const icon = leaflet.divIcon({
      className: '',
      html: `
        <div style="
          position:relative;
          width:40px; height:40px;
        ">
          <div style="
            width:40px; height:40px; border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            background:${color};
            border:3px solid #fff;
            box-shadow:0 3px 8px rgba(0,0,0,0.35);
            display:flex; align-items:center; justify-content:center;
          ">
            <span style="transform:rotate(45deg); font-size:16px; line-height:1;">⚡</span>
          </div>
          ${battery != null ? `
          <div style="
            position:absolute; bottom:-6px; left:50%; transform:translateX(-50%);
            background:${batteryColor(battery)}; color:#fff;
            font-size:9px; font-weight:800; border-radius:4px;
            padding:1px 4px; white-space:nowrap; border:1.5px solid #fff;
            box-shadow:0 1px 3px rgba(0,0,0,0.3);
          ">${battery}%</div>` : ''}
        </div>`,
      iconSize   : [40, 46],
      iconAnchor : [20, 46],
      popupAnchor: [0, -46],
    });

    const stateLabel = {
      disponible : '✅ Disponible',
      en_location: '🔋 En location',
      hors_service: '🚫 Hors service',
    }[pb.state] ?? pb.state;

    const marker = leaflet.marker([lat, lng], { icon })
      .addTo(map)
      .bindPopup(`
        <div style="font-family:system-ui,sans-serif; min-width:180px; padding:4px 0;">
          <div style="font-size:14px; font-weight:800; color:#2D1500; margin-bottom:4px;">
            ${pb.qrCode || pb.id}
          </div>
          <div style="
            display:inline-block; padding:3px 10px; border-radius:99px; margin-bottom:8px;
            background:${isDispo ? '#E6F7EC' : '#f5f5f5'};
            color:${isDispo ? '#1A9640' : '#888'};
            font-size:11px; font-weight:700;
          ">${stateLabel}</div>
          ${battery != null ? `
          <div style="margin-top:4px;">
            <div style="font-size:11px; color:#8B5E3C; margin-bottom:4px;">Batterie</div>
            <div style="height:6px; background:#eee; border-radius:99px; overflow:hidden;">
              <div style="height:100%; width:${battery}%; background:${batteryColor(battery)}; border-radius:99px;"></div>
            </div>
            <div style="font-size:11px; font-weight:700; color:${batteryColor(battery)}; margin-top:3px;">${battery}%</div>
          </div>` : ''}
        </div>
      `);

    added.push(marker);
  });

  return added;
}

