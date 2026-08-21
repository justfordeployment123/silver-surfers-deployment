// Wraps every current route (marketing pages, legal pages) with the shared
// Header/Footer chrome — mirrors the old App.js's `{!isAdminRoute &&
// <Header/>}...{!isAdminRoute && <Footer/>}` pattern, but as a proper
// Next.js route group instead of a runtime path check. (site) doesn't
// affect URLs — /about still resolves to /about. When the admin panel is
// ported (Phase 3 Group E), it gets its own sibling app/admin/layout.js
// with its own AdminLayout chrome, untouched by this one, since nested
// layouts only wrap their own subtree, not siblings.
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function SiteLayout({ children }) {
  return (
    <>
      <Header />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  );
}
