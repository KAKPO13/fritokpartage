// app/publish/page.jsx
'use client';
import dynamic from 'next/dynamic';

// Chargement dynamique côté client uniquement :
// évite le prerendering SSR qui plante sur les hooks
// Firebase et les APIs browser (XMLHttpRequest, URL.createObjectURL…)
const AddVideoPage = dynamic(
  () => import('../../components/AddVideoPage'),
  { ssr: false }
);

export default function PublishRoute() {
  return <AddVideoPage />;
}