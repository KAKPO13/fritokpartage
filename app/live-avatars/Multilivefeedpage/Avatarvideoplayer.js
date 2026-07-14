'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './ultraLive.module.css';

/**
 * AvatarVideoPlayer — port of the Flutter `AvatarVideoPlayer`.
 *
 * Plays a looping, cover-fit <video>. Playback follows `isActive`
 * exactly like the Dart version's `didUpdateWidget`: becomes active →
 * play(); becomes inactive → pause(). No native BoxFit.cover equivalent
 * on <video>, so `object-fit: cover` on the element does the same job
 * as the FittedBox/SizedBox.expand combo in Dart.
 */
export default function AvatarVideoPlayer({ videoUrl, isActive }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  // New video source → reset state, same as re-creating the controller
  // in `_initVideo()`.
  useEffect(() => {
    setReady(false);
    setHasError(false);
  }, [videoUrl]);

  // Play/pause follows isActive, once metadata is loaded.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !ready) return;
    if (isActive) {
      v.play().catch(() => {
        /* autoplay can be rejected silently, mirrors Dart's ignored catch */
      });
    } else {
      v.pause();
    }
  }, [isActive, ready]);

  if (hasError) {
    return (
      <div className={styles.videoCenter}>
        <span className={styles.videoErrorText}>Erreur vidéo</span>
      </div>
    );
  }

  return (
    <div className={styles.videoWrap}>
      {!ready && (
        <div className={styles.videoCenter}>
          <span className={styles.videoSpinner} />
        </div>
      )}
      <video
        ref={videoRef}
        src={videoUrl}
        loop
        playsInline
        autoPlay={isActive}
        onLoadedData={() => setReady(true)}
        onError={() => setHasError(true)}
        className={styles.videoEl}
        style={{ opacity: ready ? 1 : 0 }}
      />
    </div>
  );
}