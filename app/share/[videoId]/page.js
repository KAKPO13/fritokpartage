import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase"; // Assure-toi que ce chemin est correct
import VideoPlayer from "@/components/VideoPlayer"; // Ton composant de lecture

export async function generateMetadata({ params }) {
  const { videoId } = params;

  const docRef = doc(db, "video_playlist", videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return {
      title: "Vidéo introuvable",
      description: "Ce lien ne correspond à aucune vidéo.",
    };
  }

  const data = docSnap.data();

  return {
    title: data.title || "Vidéo FriTok",
    description: data.description || "Découvrez cette vidéo partagée sur FriTok.",
    openGraph: {
      title: data.title,
      description: data.description,
      images: [
        {
          url: data.thumbnail, // URL publique depuis Supabase
          width: 1200,
          height: 630,
        },
      ],
      type: "video.other",
    },
    twitter: {
      card: "summary_large_image",
      title: data.title,
      description: data.description,
      images: [data.thumbnail],
    },
  };
}

export default async function SharePage({ params }) {
  const { videoId } = params;

  const docRef = doc(db, "video_playlist", videoId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return <div>Vidéo introuvable</div>;
  }

  const data = docSnap.data();

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-2xl font-bold mb-4">{data.title}</h1>
      <VideoPlayer src={data.videoUrl} thumbnail={data.thumbnail} />
      <p className="mt-2 text-gray-600">{data.description}</p>
    </main>
  );
}







