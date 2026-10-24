'use client';

import { useEffect, useState } from 'react';
import styles from './about.module.css';

export default function AboutGlobe() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) setIsPlaying(false);
  }, []);

  const artworkClass = [
    styles.heroArtwork,
    !isPlaying && styles.motionPaused,
    isPlaying && hasInteracted && styles.motionOptIn,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.heroVisual}>
      <div className={artworkClass} aria-hidden="true">
        <span className={styles.orbitOne} />
        <span className={styles.orbitTwo} />
        <span className={styles.orbitCore}>
          <span className={styles.globeMesh}>
            <span className={styles.meridianOne} />
            <span className={styles.meridianTwo} />
            <span className={styles.meridianThree} />
            <span className={styles.meridianFour} />
            <span className={styles.latitudeOne} />
            <span className={styles.latitudeTwo} />
            <span className={styles.latitudeThree} />
          </span>
          <span className={styles.globeShine} />
          <span className={styles.globeLabel}>People <i /> Purpose <i /> Progress</span>
        </span>
        <span className={styles.orbitDotOne} />
        <span className={styles.orbitDotTwo} />
      </div>
      <button
        type="button"
        className={styles.motionButton}
        onClick={() => {
          setIsPlaying((playing) => !playing);
          setHasInteracted(true);
        }}
        aria-label={isPlaying ? 'Pause globe animation' : 'Play globe animation'}
        aria-pressed={isPlaying}
      >
        <span aria-hidden="true">{isPlaying ? 'Ⅱ' : '▶'}</span>
        {isPlaying ? 'Pause motion' : 'Animate globe'}
      </button>
    </div>
  );
}
