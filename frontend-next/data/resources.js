/**
 * Lead-magnet resource library shown on /resources.
 *
 * PLACEHOLDER DATA — per Docs/SilverSurfers_AI_Lead_Magnet_Recommendation.md
 * and todo.md Phase A2/G1. Titles/descriptions/tags come straight from the
 * recommendation doc; coverImage and the downloadUrl behind each resource
 * are not real yet (no file exists to link to until Phase G ships the real
 * assets). The `tag` field matches the GoHighLevel tag this resource maps
 * to once Phase F wires up the real integration (see leads.controller.ts).
 */
const resources = [
  {
    slug: 'accessible-by-design-report',
    title: 'Accessible by Design Survey Report',
    description: 'A survey-backed look at how older adults actually experience the web today, and what "accessible by design" means in practice.',
    coverImage: null,
    tag: 'LM - Survey Report',
  },
  {
    slug: 'accessibility-checklist',
    title: 'Website Accessibility Checklist',
    description: 'A practical, no-jargon checklist to self-audit your website against the accessibility issues that affect older adults most.',
    coverImage: null,
    tag: 'LM - Accessibility Checklist',
  },
  {
    slug: 'digital-readiness-guide',
    title: 'Silver Digital Readiness Guide',
    description: 'A guide to understanding and improving how ready your digital experience is for the 50+ market.',
    coverImage: null,
    tag: 'LM - Digital Readiness Guide',
  },
  {
    slug: 'ai-training-guide',
    title: 'AI Training Guide',
    description: 'How to use AI tools responsibly and effectively when designing for older adult users.',
    coverImage: null,
    tag: 'LM - AI Training Guide',
  },
];

export default resources;
