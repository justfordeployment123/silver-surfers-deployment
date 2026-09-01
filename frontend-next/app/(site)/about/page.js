// Ported from frontend/src/pages/About.js — purely static content, no
// hooks/state, so this stays a Server Component (zero client JS shipped
// for this route).
import Link from 'next/link';

export const metadata = {
  title: 'About Us | SilverSurfers',
  description:
    'Experts in Creating Inclusive Digital Experiences — we help businesses make their digital experiences welcoming and easy to use for everyone.',
};

const MISSION = {
  title: 'Our Mission: Making the Web Accessible for Everyone',
  description:
    "SilverSurfers was founded on the belief that the digital world should be welcoming to people of all ages. As more adults over 50 engage online, we saw a growing need for digital experiences that truly serve them. Our mission is to bridge the digital divide by helping businesses create inclusive, older adult–friendly experiences that work beautifully for every generation.",
};

const APPROACH = [
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
    ),
    title: 'Accessibility First',
    description: 'We utilize inclusive design principles that ensure digital experiences are usable for people of all abilities and technical skill levels.',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
    ),
    title: 'User-Focused',
    description: 'Every recommendation is based on real user research and testing with older adult participants.',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
    ),
    title: 'Results-Driven',
    description: 'We measure success by improved user engagement, reduced bounce rates, and positive feedback from older adult users.',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
    ),
    title: 'Partnership',
    description: 'We work with your team to enhance accessibility & inclusivity while preserving the integrity of your brand.',
  },
];

const STATS = [
  { number: '124M+', label: 'SilverSurfers Online', description: 'Active older adults utilizing digital services' },
  { number: '500+', label: 'Sites Audited', description: 'Digital experiences improved for older adults' },
  { number: '85%', label: 'Better Usability', description: 'Average improvement in older adult digital experiences' },
];

const SILVER_VALUES = [
  { letter: 'S', title: 'Supportive', description: 'We design digital experiences that guide and assist older adults with clarity.' },
  { letter: 'I', title: 'Inclusive', description: 'Our platforms welcome all users, regardless of ability or background.' },
  { letter: 'L', title: 'Legible', description: 'We prioritize readability with clear fonts, contrast, and layouts.' },
  { letter: 'V', title: 'Value', description: 'We create meaningful tools that enhance everyday life for older adults.' },
  { letter: 'E', title: 'Empowering', description: 'We enable confidence and independence through intuitive design.' },
  { letter: 'R', title: 'Respectful', description: 'We treat older adults as capable, valued users deserving of excellent digital experiences.' },
];

export default function AboutPage() {
  return (
    <>
      <style>{`
        .about-glow-1 {
          position: absolute;
          top: -120px;
          right: -80px;
          width: 560px;
          height: 560px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(10,168,143,0.18) 0%, transparent 70%);
          pointer-events: none;
        }
        .about-glow-2 {
          position: absolute;
          bottom: -100px;
          left: -60px;
          width: 360px;
          height: 360px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(10,168,143,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .about-approach-row {
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }
        .about-icon-box {
          width: 46px;
          height: 46px;
          flex-shrink: 0;
          background: var(--t05);
          color: var(--t6);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }
        .about-stat-n { color: var(--t4); }
        .about-stat-l { color: var(--ink6); }
        .about-stat-desc { color: var(--ink6); }
        .about-val-row {
          display: flex;
          align-items: flex-start;
          gap: 18px;
        }
        .about-val-letter {
          width: 48px;
          height: 48px;
          flex-shrink: 0;
          background: var(--t6);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-family: var(--ffd);
          font-size: 22px;
          font-weight: 700;
        }
        .about-values-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-width: 760px;
          margin: 0 auto;
        }
      `}</style>

      <div>

        {/* ── Hero ─────────────────────────────────── */}
        <div className="pg-hero">
          <div className="about-glow-1" aria-hidden="true" />
          <div className="about-glow-2" aria-hidden="true" />
          <div className="wrap" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <p className="eyebrow eyebrow--light" style={{ justifyContent: 'center' }}>About Us</p>
            <h1 className="h1" style={{ color: '#fff' }}>About SilverSurfers</h1>
            <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', maxWidth: '600px', margin: '0 auto' }}>
              Experts in Creating Inclusive Digital Experiences — we help businesses make their
              digital experiences welcoming and easy to use for everyone.
            </p>
          </div>
        </div>

        {/* ── Mission ──────────────────────────────── */}
        <section id="mission" className="sec">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
              <p className="eyebrow">Mission</p>
              <h2 className="h2">{MISSION.title}</h2>
            </div>
            <div className="diff">
              <p style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: '17px', lineHeight: '1.8', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
                {MISSION.description}
              </p>
            </div>
          </div>
        </section>

        {/* ── Stats ────────────────────────────────── */}
        <section id="stats" className="sec-sand">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <p className="eyebrow">Our Impact</p>
              <h2 className="h2">Measurable Results</h2>
              <p className="sub">Across digital platforms</p>
            </div>
            <div className="stats">
              {STATS.map((s, i) => (
                <div className="stat" key={i}>
                  <span className="stat-n about-stat-n">{s.number}</span>
                  <span className="stat-l about-stat-l">{s.label}</span>
                  <span className="about-stat-desc" style={{ fontSize: '16px', marginTop: '4px', display: 'block' }}>
                    {s.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Approach & Values ────────────────────── */}
        <section id="approach" className="sec">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <p className="eyebrow">How We Work</p>
              <h2 className="h2">Our Approach & Values</h2>
              <p className="sub">The core principles that guide our work</p>
            </div>
            <div className="g2">
              {APPROACH.map((item, i) => (
                <div className="card" key={i}>
                  <div className="card-bar" />
                  <div className="about-approach-row">
                    <div className="about-icon-box">{item.icon}</div>
                    <div>
                      <h3 className="h3" style={{ marginBottom: '8px' }}>{item.title}</h3>
                      <p style={{ fontSize: '16px', color: 'var(--ink6)', lineHeight: '1.65' }}>
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SILVER Values ─────────────────────────── */}
        <section id="team" className="sec-sand">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <p className="eyebrow">Our Values</p>
              <h2 className="h2">The SILVER Standard</h2>
              <p className="sub">The principles that guide how we serve, innovate, and build inclusive digital experiences</p>
            </div>
            <div className="about-values-list">
              {SILVER_VALUES.map((val, i) => (
                <div className="card" key={i}>
                  <div className="card-bar" />
                  <div className="about-val-row">
                    <div className="about-val-letter">{val.letter}</div>
                    <div>
                      <h3 className="h3" style={{ marginBottom: '6px' }}>{val.title}</h3>
                      <p style={{ fontSize: '16px', color: 'var(--ink6)', lineHeight: '1.65' }}>
                        {val.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────── */}
        <section className="cta-sec">
          <div className="wrap" style={{ textAlign: 'center' }}>
            <h2 className="h2" style={{ color: '#fff', marginBottom: '16px' }}>
              Curious to learn more or have questions?
            </h2>
            <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', marginBottom: '36px', maxWidth: '580px', marginLeft: 'auto', marginRight: 'auto' }}>
              We&rsquo;re not a faceless company – we&rsquo;re people who care deeply about inclusive,
              older adult–friendly digital experiences. Reach out anytime.
            </p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <Link href="/contact#contact-form" className="btn btn-p">Contact Us</Link>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}
