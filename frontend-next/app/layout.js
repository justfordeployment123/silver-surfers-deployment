import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font — replaces the render-blocking Google Fonts
// <link> tags from the CRA app's public/index.html. Variable names match
// what globals.css's --ffd/--ff tokens expect (see app/globals.css).
const playfairDisplay = Playfair_Display({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
});

const dmSans = DM_Sans({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

export const metadata = {
  title: "SilverSurfers - Older Adult Friendly Website Auditing",
  description:
    "SilverSurfers - Making websites senior-friendly. Get your seal of approval for elderly-accessible web design.",
  manifest: "/manifest.json",
  icons: {
    // Ported from public/index.html, fixing a live bug there: it pointed
    // apple-touch-icon at "logo.jpeg", a file that doesn't exist in
    // public/ (only logo.jpg does) - silent 404 on iOS home-screen add.
    icon: "/Logo.png",
    apple: "/logo.jpg",
  },
};

export const viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
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

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${dmSans.variable}`}
      // The inline theme-init script below sets data-theme on this element
      // client-side, before hydration, on purpose (that's how it avoids a
      // flash of the wrong theme) — this intentionally differs from the
      // server-rendered markup, so silence the (expected) mismatch warning
      // instead of trying to "fix" it away.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
