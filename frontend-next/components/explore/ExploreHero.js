// Server Component — pure markup, no interactivity. Unlike every other
// page's dark, centered .pg-hero (globals.css ~551), the approved Explore
// mockup is a light, left-aligned, two-column hero (text + photo) — a
// deliberate deviation per the source doc's own mockup, so this gets its
// own scoped styles rather than reusing .pg-hero. See Milestone 3.0
// Developer Plan, Module 2.
//
// Hero photo: public/explore/hero.png is the client-supplied, text-free
// crop of the mockup's "three colleagues at a laptop" photo (native
// 1206x257 — a short, wide strip). The column below is taller than that
// native ratio, so object-fit: cover crops the sides rather than the
// mockup's framing; object-position is tuned to keep all three faces and
// the pointing hand/laptop in frame rather than defaulting to 50% 50%.
export default function ExploreHero() {
  return (
    <section className="explore-hero">
      <style>{`
        .explore-hero {
          background: var(--bg);
          padding: 104px 0 64px;
        }
        .explore-hero-inner {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          align-items: center;
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
          max-width: 460px;
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
        .explore-hero-media {
          border-radius: var(--rl);
          overflow: hidden;
          /* Native photo is 1206x257 (~4.7:1, a short wide strip). 2.5:1
             is as tall as this column can go while still keeping all
             three people in frame — taller crops cut the third person off
             the right edge (checked visually, see Module 2 notes). */
          aspect-ratio: 5 / 2;
        }
        .explore-hero-media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 56% 25%;
          display: block;
        }
        @media (max-width: 768px) {
          .explore-hero { padding: 88px 0 48px; }
          .explore-hero-inner { grid-template-columns: 1fr; }
          .explore-hero-media { order: -1; aspect-ratio: 2 / 1; }
        }
      `}</style>
      <div className="wrap">
        <div className="explore-hero-inner">
          <div>
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
          <div className="explore-hero-media">
            <img
              src="/explore/hero.png"
              alt="Three colleagues reviewing a laptop together in an office"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
