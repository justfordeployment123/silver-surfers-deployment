'use client';

// Ported verbatim from frontend/src/components/HeroGlobe.js. Reads
// document.documentElement/window (theme observer, ResizeObserver, RAF) and
// pulls in three.js + react-globe.gl, so this must never run on the server —
// loaded exclusively via components/home/HeroGlobeLoader.js's
// next/dynamic(..., { ssr: false }), the direct replacement for the old
// app's React.lazy() + Suspense code-split point.
import { useCallback, useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import countryStats from '../data/countryStats';

// Three.js material/line colors can't read CSS variables — they're canvas
// draw calls, not DOM styles — so the two themes need their own literal
// palettes here, kept in sync by hand with globals.css's --t* tokens.
const PALETTES = {
  dark: {
    sphereColor: '#102F45',
    sphereEmissive: '#16445A',
    emissiveIntensity: 0.18,
    atmosphere: '#54D6DC',
    tipBg: '#102F45',
    capHover: '#54D6DC',
    capHoverNoStat: 'rgba(84,214,220,0.55)',
    capDefault: 'rgba(10,168,143,0.84)',
    capDefaultNoStat: 'rgba(84,214,220,0.16)',
    sideColor: 'rgba(16,47,69,0.35)',
    strokeHover: 'rgba(255,255,255,0.55)',
    strokeDefault: 'rgba(221,248,250,0.28)',
    graticuleColor: 'lightgrey',
    graticuleOpacity: 0.1,
  },
  light: {
    sphereColor: '#DDF8FA',
    sphereEmissive: '#54D6DC',
    emissiveIntensity: 0.1,
    atmosphere: '#087D79',
    tipBg: '#102F45',
    capHover: '#087D79',
    capHoverNoStat: 'rgba(8,125,121,0.35)',
    capDefault: 'rgba(10,168,143,0.85)',
    capDefaultNoStat: 'rgba(8,125,121,0.14)',
    sideColor: 'rgba(16,47,69,0.22)',
    strokeHover: 'rgba(16,47,69,0.6)',
    strokeDefault: 'rgba(16,47,69,0.3)',
    graticuleColor: '#16445A',
    graticuleOpacity: 0.28,
  },
};

const getTheme = () => (
  document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
);

const HeroGlobe = () => {
  const globeRef = useRef(null);
  const wrapRef = useRef(null);
  const materialRef = useRef(null);

  const [countries, setCountries] = useState([]);
  const [size, setSize] = useState(360);
  const [hovered, setHovered] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [theme, setTheme] = useState(getTheme);
  const palette = PALETTES[theme];

  // Follow the site's theme toggle — it flips document.documentElement's
  // data-theme attribute in place (no page reload), so watch for that.
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Load the static world-countries GeoJSON once.
  useEffect(() => {
    let active = true;
    fetch('/data/world-countries.json')
      .then((res) => res.json())
      .then((data) => { if (active) setCountries(data.features || []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Keep the globe square and sized to its container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setSize(Math.round(el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // react-globe.gl's OrbitControls.autoRotateSpeed unit is 6°/sec per point
  // (e.g. speed=5 -> 30°/sec -> a full rotation every ~12s). Deliberately
  // fast enough to read as motion immediately, not a subtle drift.
  const AUTO_ROTATE_SPEED = 5;

  // Acquire OrbitControls robustly: onGlobeReady can fire before the
  // controls instance is actually attached, and it only fires once, so a
  // single-shot lookup can silently miss it and leave auto-rotate unset
  // forever. Retry across frames until it's actually there.
  useEffect(() => {
    let cancelled = false;
    let raf;

    const trySetup = () => {
      if (cancelled) return;
      const controls = globeRef.current?.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
        controls.enableZoom = false;
        controls.enablePan = false;
        globeRef.current.pointOfView({ lat: 22, lng: -40, altitude: 2.05 });
      } else {
        raf = requestAnimationFrame(trySetup);
      }
    };
    trySetup();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const setAutoRotate = useCallback((value) => {
    const controls = globeRef.current?.controls();
    if (controls) controls.autoRotate = value;
  }, []);

  const handleHover = useCallback((polygon) => {
    setHovered(polygon || null);
    setAutoRotate(!polygon);
  }, [setAutoRotate]);

  const handleClick = useCallback((polygon) => {
    // Clicking a country pins the rotation stopped there, same as hovering.
    setHovered(polygon || null);
    setAutoRotate(!polygon);
  }, [setAutoRotate]);

  const handleMouseEnter = useCallback(() => setAutoRotate(false), [setAutoRotate]);
  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    setAutoRotate(true);
  }, [setAutoRotate]);

  const handleMouseMove = useCallback((e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  if (!materialRef.current) {
    materialRef.current = new THREE.MeshPhongMaterial({
      color: palette.sphereColor,
      emissive: palette.sphereEmissive,
      emissiveIntensity: palette.emissiveIntensity,
      shininess: 6,
    });
  }

  // Material colors are mutable THREE.Color objects, not React-diffed props
  // — update them in place whenever the theme flips instead of recreating
  // the whole material (and the globe with it).
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.color.set(palette.sphereColor);
    material.emissive.set(palette.sphereEmissive);
    material.emissiveIntensity = palette.emissiveIntensity;
  }, [palette]);

  // The lat/long grid (showGraticules) has no color prop in react-globe.gl —
  // it's a single LineSegments mesh nested a few levels deep (inside a
  // Group, not a direct scene child) with a fixed lightgrey/0.1 material,
  // indistinguishable from the ~180 country-border LineSegments except by
  // that exact default color+opacity signature. Find it once via a full
  // traverse (children.find alone misses nested objects), tag it, and
  // recolor in place whenever the theme changes.
  const graticuleRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let raf;

    const trySetup = () => {
      if (cancelled) return;
      if (!graticuleRef.current) {
        const scene = globeRef.current?.scene?.();
        scene?.traverse((obj) => {
          if (
            !graticuleRef.current
            && obj.isLineSegments
            && obj.material?.color?.getHexString() === 'd3d3d3'
            && obj.material.opacity === 0.1
          ) {
            graticuleRef.current = obj;
          }
        });
      }
      if (graticuleRef.current) {
        graticuleRef.current.material.color.set(palette.graticuleColor);
        graticuleRef.current.material.opacity = palette.graticuleOpacity;
      } else {
        raf = requestAnimationFrame(trySetup);
      }
    };
    trySetup();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [palette]);

  const capColor = useCallback((d) => {
    const hasStat = Boolean(countryStats[d.id]);
    const isHovered = d === hovered;
    if (isHovered) return hasStat ? palette.capHover : palette.capHoverNoStat;
    return hasStat ? palette.capDefault : palette.capDefaultNoStat;
  }, [hovered, palette]);

  const strokeColor = useCallback((d) => (
    d === hovered ? palette.strokeHover : palette.strokeDefault
  ), [hovered, palette]);

  const altitude = useCallback((d) => (d === hovered ? 0.02 : 0.006), [hovered]);

  const hoveredStat = hovered && countryStats[hovered.id];

  return (
    <>
      <style>{`
        .hg3-wrap {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .hg3-tip {
          position: absolute;
          transform: translate(-50%, calc(-100% - 14px));
          background: ${palette.tipBg};
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: var(--r);
          padding: 9px 13px;
          white-space: nowrap;
          font-family: var(--ff);
          pointer-events: none;
          z-index: 5;
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        }
        .hg3-tip-title { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 3px; }
        .hg3-tip-stat  { font-size: 16px; color: var(--t2); line-height: 1.5; }

        @media (prefers-reduced-motion: reduce) {
          .hg3-wrap { animation: none; }
        }
      `}</style>

      <div
        className="hg3-wrap"
        ref={wrapRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-hidden="true"
      >
        <Globe
          ref={globeRef}
          width={size}
          height={size}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl={null}
          globeMaterial={materialRef.current}
          showGraticules
          showAtmosphere
          atmosphereColor={palette.atmosphere}
          atmosphereAltitude={0.2}
          polygonsData={countries}
          polygonCapColor={capColor}
          polygonSideColor={() => palette.sideColor}
          polygonStrokeColor={strokeColor}
          polygonAltitude={altitude}
          polygonsTransitionDuration={250}
          onPolygonHover={handleHover}
          onPolygonClick={handleClick}
          animateIn={false}
        />

        {hoveredStat && (
          <div className="hg3-tip" style={{ left: mousePos.x, top: mousePos.y }}>
            <div className="hg3-tip-title">{hoveredStat.name}</div>
            <div className="hg3-tip-stat">{hoveredStat.buyingPower}</div>
            <div className="hg3-tip-stat">{hoveredStat.reach}</div>
          </div>
        )}
      </div>
    </>
  );
};

export default HeroGlobe;
