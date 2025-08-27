// lib/hooks/useVideoQueue.ts
import { useState, useCallback } from "react";

export interface VideoItem {
  id: string;
  url: string;
  product?: {
    id: string;
    name: string;
    price: number;
    imageUrl: string;
  };
}

export function useVideoQueue(playlist: VideoItem[]) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentVideo = playlist[currentIndex] || null;

  const next = useCallback(() => {
    setCurrentIndex((prev) => (prev < playlist.length - 1 ? prev + 1 : prev));
  }, [playlist]);

  const prev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const jumpTo = useCallback((index: number) => {
    if (index >= 0 && index < playlist.length) {
      setCurrentIndex(index);
    }
  }, [playlist]);

  return {
    currentVideo,
    currentIndex,
    next,
    prev,
    jumpTo,
    hasNext: currentIndex < playlist.length - 1,
    hasPrev: currentIndex > 0,
  };
}
