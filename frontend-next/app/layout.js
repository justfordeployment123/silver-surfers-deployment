import Script from "next/script";
import { Poppins } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font — replaces the render-blocking Google Fonts
// <link> tags from the CRA app's public/index.html. Variable names match
// what globals.css's --ffd/--ff tokens expect (see app/globals.css).
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata = {
  title: "SilverSurfers - Older Adult Friendly Website Auditing",
  description:
    "SilverSurfers - Making websites senior-friendly. Get your seal of approval for elderly-accessible web design.",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.jpg",
  },
};

export const viewport = {
  themeColor: "#017FA1",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  userScalable: true,
};

// Runs before hydration to set data-theme from the user's saved preference
// (or OS preference) before first paint, preventing a flash of the wrong
// theme. Ported verbatim from public/index.html's inline <script>.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem('ss-theme');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

// LinkedIn Insight Tag (client-provided partner ID 10021236) — sitewide, per
// LinkedIn's own install instructions ("paste into the global footer of
// your domain"). Base pixel only: it lets LinkedIn Campaign Manager
// attribute site visits/conversions back to LinkedIn ad clicks. Firing a
// specific "ran a Quick Scan" conversion event additionally requires a
// Conversion ID created in Campaign Manager (client-side setup, not a code
// change) — see the conversion-tracking call in QuickScanSection.js once
// that ID exists.
const LINKEDIN_PARTNER_ID = "10021236";
const LINKEDIN_INSIGHT_INIT_SCRIPT = `
_linkedin_partner_id = "${LINKEDIN_PARTNER_ID}";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
`;
const LINKEDIN_INSIGHT_LOADER_SCRIPT = `
(function(l) {
  if (!l) {
    window.lintrk = function (a, b) { window.lintrk.q.push([a, b]) };
    window.lintrk.q = [];
  }
  var s = document.getElementsByTagName("script")[0];
  var b = document.createElement("script");
  b.type = "text/javascript"; b.async = true;
  b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
  s.parentNode.insertBefore(b, s);
})(window.lintrk);
`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={poppins.variable}
      // The inline theme-init script below sets data-theme on this element
      // client-side, before hydration, on purpose (that's how it avoids a
      // flash of the wrong theme) — this intentionally differs from the
      // server-rendered markup, so silence the (expected) mismatch warning
      // instead of trying to "fix" it away.
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, user-scalable=yes" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Script id="linkedin-insight-init" strategy="afterInteractive">
          {LINKEDIN_INSIGHT_INIT_SCRIPT}
        </Script>
        <Script id="linkedin-insight-loader" strategy="afterInteractive">
          {LINKEDIN_INSIGHT_LOADER_SCRIPT}
        </Script>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element -- LinkedIn's tracking pixel, not an optimizable content image */}
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            alt=""
            src={`https://px.ads.linkedin.com/collect/?pid=${LINKEDIN_PARTNER_ID}&fmt=gif`}
          />
        </noscript>
      </body>
    </html>
  );
}
