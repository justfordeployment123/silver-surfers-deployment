// Ported verbatim from frontend/src/components/AdminIcons.js. Pure SVG
// components, no hooks or browser APIs — safe to import from either Server
// or Client Components.
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const IconChart = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M3 3v18h18" /><path d="M7 16v-4M12 16V8M17 16v-7" /></svg>
);
export const IconUsers = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
);
export const IconDocument = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" /></svg>
);
export const IconQuestion = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 2-3 4" /><path d="M12 17h.01" /></svg>
);
export const IconSearch = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
);
export const IconLayers = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
);
export const IconBolt = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M13 2 3 14h7l-1 8 11-13h-7l1-7z" /></svg>
);
export const IconStar = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" /></svg>
);
export const IconGem = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M2 9h20M9 3l3 6-3 12M15 3l-3 6 3 12" /></svg>
);
export const IconClock = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
);
export const IconMail = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M4 4h16v16H4z" /><path d="M22 6l-10 7L2 6" /></svg>
);
export const IconClipboard = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M9 2h6a1 1 0 011 1v2H8V3a1 1 0 011-1z" /><path d="M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2" /><path d="M9 12h6M9 16h6" /></svg>
);
export const IconCheckCircle = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" /></svg>
);
export const IconPencil = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></svg>
);
export const IconTag = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M20.59 13.41 11 3.83A2 2 0 009.5 3H4a1 1 0 00-1 1v5.5a2 2 0 00.59 1.41l9.59 9.59a2 2 0 002.83 0l4.58-4.58a2 2 0 000-2.83z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
);
export const IconPackage = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>
);
export const IconRuler = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M3 17l14-14 4 4-14 14z" /><path d="M11 8l2 2M8 11l2 2M14 5l2 2" /></svg>
);
