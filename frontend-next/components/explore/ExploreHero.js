// Server Component — pure markup, no interactivity. Unlike every other
// page's dark, centered .pg-hero (globals.css ~551), the approved Explore
// mockup is a light, left-aligned hero where the photo bleeds across the
// right side of the banner and fades/blends into the text block rather than
// sitting in its own boxed panel with a gap — a deliberate deviation per
// the source doc's own mockup, so this gets its own scoped styles rather
// than reusing .pg-hero. See Milestone 3.0 Developer Plan, Module 2.
//
// Blend technique: the photo is absolutely positioned behind the text,
// right-aligned and wider than the visible text column; a gradient overlay
// (solid var(--bg) under the text, fading to transparent over the photo)
// sits on top of it. Because the gradient's solid color is the real
// --bg token (not a hardcoded hex), this blends correctly in both themes
// without a separate dark-mode override.
export default function ExploreHero() {
  return (
    <section className="explore-hero">
      <style>{`
        .explore-hero {
          background: var(--bg);
        }
        .explore-hero-inner {
          position: relative;
          overflow: hidden;
          min-height: 520px;
          display: flex;
          align-items: center;
        }
        .explore-hero-photo {
          position: absolute;
          top: 0;
          right: 0;
          width: 70%;
          height: 100%;
          object-fit: cover;
          object-position: 70% 22%;
          display: block;
        }
        .explore-hero-fade {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, var(--bg) 0%, var(--bg) 32%, rgba(0,0,0,0) 62%);
        }
        .explore-hero-content {
          position: relative;
          z-index: 2;
          max-width: 480px;
          padding: 64px 0;
        }
        .explore-hero-eyebrow {
          font-size: 16px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--t6);
          margin-bottom: 14px;
        }
        .explore-hero-headline {
          font-family: var(--ffd);
          font-size: clamp(32px, 4.5vw, 54px);
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.03em;
          color: var(--ink);
          margin-bottom: 18px;
        }
        .explore-hero-headline-accent { color: var(--t6); }
        .explore-hero-subhead {
          font-size: 17px;
          color: var(--ink6);
          line-height: 1.7;
          font-weight: 300;
          margin-bottom: 22px;
        }
        .explore-hero-tagline {
          display: inline-block;
          font-family: var(--ffs);
          font-size: 34px;
          line-height: 1;
          color: var(--t6);
          padding-bottom: 14px;
          /* Hand-drawn curved swash, not a straight border-bottom — matches
             the mockup's loose brush underline better than a ruled line.
             Color is a literal #017FA1 (== --t6's value) because SVG
             data-URIs can't reference CSS custom properties; --t6 is a
             fixed, non-theme-swapping token (see globals.css's teal scale
             comment) so hardcoding its current value here is safe. */
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 220 14' preserveAspectRatio='none'%3E%3Cpath d='M3 8 C 60 14, 160 2, 217 9' fill='none' stroke='%23017FA1' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E") left bottom / 100% 14px no-repeat;
        }
        @media (max-width: 768px) {
          /* Unlike desktop, the photo isn't behind the text here — it's a
             stacked banner above it, so it needs real clearance from the
             fixed 64px header (Header.js) instead of tucking under it. */
          .explore-hero-inner { display: block; min-height: 0; padding-top: 64px; }
          .explore-hero-photo {
            position: static;
            width: 100%;
            height: auto;
            aspect-ratio: 2 / 1;
            object-position: 50% 30%;
          }
          .explore-hero-fade { display: none; }
          .explore-hero-content { max-width: 100%; padding: 24px 0 48px; }
        }
      `}</style>
      <div className="wrap">
        <div className="explore-hero-inner">
          <img
            className="explore-hero-photo"
            src="/explore/hero.svg"
            alt="Three colleagues reviewing a laptop together in an office"
          />
          <div className="explore-hero-fade" />
          <div className="explore-hero-content">
            <p className="explore-hero-eyebrow">More from SilverSurfers.ai</p>
            <h1 className="explore-hero-headline">
              Tools for Smarter
              <br />
              Decisions in a
              <br />
              <span className="explore-hero-headline-accent">Changing World</span>
            </h1>
            <p className="explore-hero-subhead">
              Explore practical training, assessments, and resources designed to help leaders
              navigate AI, business, and what comes next.
            </p>
            <span className="explore-hero-tagline">Learn. Assess. Grow.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
