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
      className={poppins.variable}
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
