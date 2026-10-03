// Server Component — pure markup, no interactivity. Unlike every other
// page's dark, centered .pg-hero (globals.css ~551), the approved Explore
// mockup is a light, left-aligned, two-column hero (text + photo) — a
// deliberate deviation per the source doc's own mockup, so this gets its
// own scoped styles rather than reusing .pg-hero. See Milestone 3.0
// Developer Plan, Module 2.
//
// NOTE: the approved mockup's photo (three people at a laptop) has the
// headline baked into the image pixels, so it can't be used as a clean,
// theme-aware background — no text-free crop exists yet. The image column
// below renders a placeholder panel until design supplies one; swapping in
// the real photo is then a one-line change (replace the placeholder div
// with an <img>). Same "not real yet" pattern data/resources.js already
// uses for its pending coverImage assets.
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
          margin-bottom: 20px;
        }
        .explore-hero-tagline {
          display: inline-block;
          font-size: 22px;
          font-style: italic;
          font-weight: 600;
          color: var(--t6);
          padding-bottom: 6px;
          border-bottom: 2px solid var(--t4);
        }
        .explore-hero-media {
          border-radius: var(--rl);
          background: var(--sand);
          border: 1px solid var(--sandd);
          aspect-ratio: 4 / 3;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--ink3);
          font-size: 16px;
          text-align: center;
          padding: 24px;
        }
        @media (max-width: 768px) {
          .explore-hero { padding: 88px 0 48px; }
          .explore-hero-inner { grid-template-columns: 1fr; }
          .explore-hero-media { order: -1; aspect-ratio: 16 / 9; }
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
          <div className="explore-hero-media" role="img" aria-label="Three colleagues reviewing a laptop together in an office">
            Hero photo pending final asset from design
          </div>
        </div>
      </div>
    </section>
  );
}
