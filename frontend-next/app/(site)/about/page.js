import Image from 'next/image';
import Link from 'next/link';
import styles from './about.module.css';

function ArrowIcon({ direction = 'upRight' }) {
  const paths = {
    upRight: 'M5 15 15 5 M7 5h8v8',
    right: 'M4 10h12 M11 5l5 5-5 5',
    down: 'M10 3v14 M5 12l5 5 5-5',
  };

  return (
    <svg className={styles.arrowIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d={paths[direction]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const metadata = {
  title: 'About Us | SilverSurfers.ai',
  description:
    'Meet the leaders behind SilverSurfers and learn how we connect accessible digital experiences, AI, and business intelligence to real business outcomes.',
};

const leaders = [
  {
    name: 'Ulya Khan',
    role: 'Enterprise Executive & AI Advisor',
    image: '/ulya-khan.jpg',
    alt: 'Portrait of Ulya Khan',
    lead: 'Three decades of leadership. One clear focus: practical AI that creates measurable value.',
    paragraphs: [
      'Ulya Khan is an enterprise executive and AI advisor with more than 30 years of leadership experience across healthcare, digital health, financial services, and technology-enabled businesses. Having served as a board member, investor, CEO, COO, and hands-on operational leader, she brings a practical, whole-business perspective to AI transformation.',
      'She helps management and executive teams identify promising AI opportunities, assess their strategic and operational value, and connect initiatives to measurable business outcomes, from productivity and workflow improvements to revenue growth and stronger customer experiences. Her approach combines deep operating experience with formal training in AI consulting and automation to help organizations move beyond experimentation and realize meaningful AI ROI.',
    ],
  },
  {
    name: 'Jackie Gross',
    role: 'Co-Founder | SilverSurfers, Inc.',
    image: '/jackie-gross.jpg',
    alt: 'Portrait of Jackie Gross',
    lead: 'A business leader who turns ambitious ideas into sustainable growth.',
    paragraphs: [
      'Jackie Gross is an accomplished business executive with extensive experience in operations, strategic growth, and organizational transformation. Throughout her career, she has led high-performing teams, managed multimillion-dollar budgets, and developed innovative programs that drive efficiency, revenue growth, and customer engagement.',
      'With a background spanning healthcare, technology, and business consulting, Jackie brings a practical, results-driven approach to helping organizations navigate change and embrace new opportunities. As Co-Founder of SilverSurfers, Inc., she is passionate about helping businesses use artificial intelligence, business intelligence, and innovative solutions to improve performance, streamline operations, and achieve sustainable growth.',
    ],
  },
  {
    name: 'Zubair Khan',
    role: 'Sales & Technology Professional',
    image: '/zubair.jpg',
    alt: 'Portrait of Zubair Khan',
    lead: 'Connecting client needs with practical technology and measurable business results.',
    paragraphs: [
      'Zubair Khan is a sales and technology professional with experience building client relationships, solving business challenges, and driving revenue growth across SaaS, healthcare, and venture capital.',
      'Most recently, he generated $25,000 in cash collected as a full-cycle Sales Specialist, conducting over 700 sales calls involving prospect qualification, objection handling, and closing. As an Implementation Consultant, he delivered automation solutions, increased CRM productivity by 30%, and presented a webinar to 40 executives that secured a software contract.',
      'Previous achievements include developing a reporting platform for $179 million in investment assets, contributing to a $14 million investment deal, and accelerating regulatory approval by four months, saving $40,000.',
      'With an engineering background and strong client focus, he brings a commercially focused mindset and a commitment to delivering measurable results.',
    ],
  },
];

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="about-title">
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.shell}>
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>About SilverSurfers</p>
            <h1 id="about-title">Technology should move <em>people</em> forward.</h1>
            <p className={styles.heroLead}>We bring business experience, thoughtful AI, and inclusive digital design together to help organizations make better decisions and build experiences that work for everyone.</p>
            <div className={styles.heroActions}>
              <a href="#leadership" className={styles.buttonPrimary}>Meet Our Leadership <ArrowIcon /></a>
              <Link href="/contact#contact-form" className={styles.buttonQuiet}>Start a Conversation <ArrowIcon direction="right" /></Link>
            </div>
          </div>
          <div className={styles.heroArtwork} aria-hidden="true">
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
        </div>
        <div className={styles.heroBottom} aria-hidden="true"><span>01 / Our Story</span><span className={styles.scrollCue}>Scroll to explore <ArrowIcon direction="down" /></span></div>
      </section>

      <section className={styles.intro} aria-labelledby="intro-title">
        <div className={styles.shell}>
          <div className={styles.introGrid}>
            <div><p className={styles.eyebrow}>Why we exist</p><h2 id="intro-title">Progress is only meaningful when people can use it.</h2></div>
            <div className={styles.introCopy}>
              <p>SilverSurfers.ai began with a simple belief: digital experiences should welcome people of every age and ability. Our accessibility and usability work helps organizations see where their websites create friction and how to make them easier to use.</p>
              <p>Through SilverSurfers, Inc., our work extends into AI solutions, business intelligence, and advisory services. The same principle guides both: understand the people and the business problem first, then put technology to work with purpose.</p>
              <a href="https://silversurfersinc.com" target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>Explore SilverSurfers, Inc. <ArrowIcon /></a>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.leadership} id="leadership" aria-labelledby="leadership-title">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>The people behind the work</p>
            <h2 id="leadership-title">Experience that connects vision to action.</h2>
            <p>Meet the leaders bringing operational judgment and a people-first perspective to SilverSurfers.</p>
          </div>
          <div className={styles.leaderList}>
            {leaders.map((leader, index) => (
              <article className={`${styles.leader} ${index % 2 ? styles.leaderReverse : ''}`} key={leader.name}>
                <div className={styles.portraitWrap}>
                  <Image className={styles.portrait} src={leader.image} alt={leader.alt} fill sizes="(max-width: 780px) 92vw, 40vw" />
                  <span className={styles.portraitNumber} aria-hidden="true">0{index + 1}</span>
                </div>
                <div className={styles.leaderCopy}>
                  <p className={styles.eyebrow}>Leadership / 0{index + 1}</p>
                  <h3>{leader.name}</h3>
                  <p className={styles.role}>{leader.role}</p>
                  <p className={styles.leaderLead}>{leader.lead}</p>
                  {leader.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.principles} aria-labelledby="principles-title">
        <div className={styles.shell}>
          <div className={styles.principlesHead}><p className={styles.eyebrow}>How we work</p><h2 id="principles-title">Clear thinking. Useful outcomes.</h2></div>
          <div className={styles.principleGrid}>
            <div><span>01</span><h3>Start with people</h3><p>Make digital experiences easier to understand and use, especially for older adults.</p></div>
            <div><span>02</span><h3>Connect the whole business</h3><p>Look at technology through the lens of operations, customer experience, and measurable value.</p></div>
            <div><span>03</span><h3>Make progress practical</h3><p>Turn findings and opportunities into clear next steps teams can act on.</p></div>
          </div>
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title">
        <div className={styles.shell}>
          <p className={styles.eyebrow}>Let&apos;s connect</p>
          <h2 id="closing-title">Ready to build what comes next?</h2>
          <p>Tell us what your organization is trying to improve. We&apos;ll help you find a practical place to start.</p>
          <Link href="/contact#contact-form" className={styles.buttonPrimary}>Contact Our Team <ArrowIcon /></Link>
        </div>
      </section>
    </div>
  );
}
