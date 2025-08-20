
'use client';
import Image from "next/image";


export default function Home() {
  return (
    <div>
      <h1>Test Supabase</h1>
      <p>URL: {process.env.NEXT_PUBLIC_SUPABASE_URL}</p>
      <p>Key: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 10)}...</p>
    </div>
  );
}