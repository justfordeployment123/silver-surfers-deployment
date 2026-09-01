// Ported from frontend/src/pages/Blog.js. Server Component: fetches the
// first page of published posts server-side (see lib/publicApi.js),
// eliminating the "Loading posts…" spinner flash — the first page has real
// content on first paint. Everything past page 1 is Phase 4's "Load more"
// button, a Client Component (BlogPostsGrid) — the migration plan calls
// out predictable, explicit pagination controls over auto-triggered
// infinite scroll as the more accessible choice for this app's audience.
import Link from 'next/link';
import RichTextPreviewLight from '../../../components/RichTextPreviewLight';
import BlogPostsGrid from '../../../components/blog/BlogPostsGrid';
import { fetchJSON } from '../../../lib/publicApi';

const PAGE_SIZE = 9;

export const metadata = {
  title: 'Blog | SilverSurfers',
  description: 'Practical guides, tips, and case studies on creating a delightful digital experience.',
};

async function getPosts() {
  const { ok, data } = await fetchJSON(`/blogs?published=true&page=1&limit=${PAGE_SIZE}`, { next: { revalidate: 60 } });
  if (!ok) {
    return { posts: [], pagination: { total: 0, page: 1, limit: PAGE_SIZE, pages: 1 }, error: data?.error || 'Failed to load posts' };
  }
  const items = Array.isArray(data.items) ? data.items : data.blogs || data.posts || [];
  return {
    posts: items,
    pagination: {
      total: Number(data.total) || items.length,
      page: Number(data.page) || 1,
      limit: Number(data.limit) || PAGE_SIZE,
      pages: Math.max(1, Number(data.pages) || 1),
    },
    error: null,
  };
}

export default async function BlogPage() {
  const { posts, pagination, error } = await getPosts();

  const featuredPost = posts.length
    ? posts.find((post) => post.featured === true) || posts[0]
    : null;

  return (
    <>
      <style>{`
        .blog-glow-1 {
          position: absolute; top: -100px; right: -60px;
          width: 480px; height: 480px; border-radius: 50%;
          background: radial-gradient(circle, rgba(10,168,143,0.18) 0%, transparent 70%);
          pointer-events: none;
        }
        .blog-glow-2 {
          position: absolute; bottom: -80px; left: -40px;
          width: 300px; height: 300px; border-radius: 50%;
          background: radial-gradient(circle, rgba(10,168,143,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .blog-feat-card {
          background: var(--surface);
          border-radius: var(--rl);
          padding: 36px;
          border: 1px solid var(--sandd);
          box-shadow: 0 4px 20px rgba(16,47,69,0.07);
          max-width: 820px;
          margin: 0 auto;
        }
        .blog-feat-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin: 16px 0 20px;
          font-size: 16px;
          color: var(--ink6);
        }
        .blog-feat-meta-item { display: flex; align-items: center; gap: 5px; }
        .blog-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 16px; color: var(--ink6); margin: 10px 0 16px; }
        .blog-post-excerpt { font-size: 16px; color: var(--ink6); line-height: 1.65; margin: 8px 0; }
        .blog-no-posts { text-align: center; padding: 60px 0; }
        .blog-no-posts-icon {
          width: 56px; height: 56px; background: var(--t05); border-radius: 12px;
          display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--t4);
        }
        .blog-status { text-align: center; padding: 40px 0; font-size: 16px; color: var(--ink6); }
        .blog-status.err { color: var(--coral); }
      `}</style>

      <div>

        {/* ── Hero ─────────────────────────────────── */}
        <div className="pg-hero">
          <div className="blog-glow-1" aria-hidden="true" />
          <div className="blog-glow-2" aria-hidden="true" />
          <div className="wrap" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <p className="eyebrow eyebrow--light" style={{ justifyContent: 'center' }}>Blog</p>
            <h1 className="h1" style={{ color: '#fff' }}>Accessibility & Silver UX</h1>
            <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', maxWidth: '560px', margin: '0 auto' }}>
              Practical guides, tips, and case studies on creating a delightful digital experience.
            </p>
          </div>
        </div>

        {/* ── Featured Post ─────────────────────────── */}
        {featuredPost && (
          <section className="sec-sand">
            <div className="wrap">
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <p className="eyebrow">Featured</p>
                <h2 className="h2">Featured Insight</h2>
              </div>
              <div className="blog-feat-card">
                <div className="card-bar" />
                <span className="tag">{(featuredPost.category || 'featured').replace('-', ' ')}</span>
                <h2 className="h2" style={{ marginTop: '12px', marginBottom: '4px' }}>{featuredPost.title}</h2>
                <div className="blog-feat-meta">
                  {featuredPost.author && (
                    <span className="blog-feat-meta-item">
                      <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                      By {featuredPost.author}
                    </span>
                  )}
                  {featuredPost.date && (
                    <span className="blog-feat-meta-item">
                      <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                      </svg>
                      {new Date(featuredPost.date).toLocaleDateString()}
                    </span>
                  )}
                  {featuredPost.readTime && (
                    <span className="blog-feat-meta-item">
                      <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                      {featuredPost.readTime}
                    </span>
                  )}
                </div>
                <div className="blog-post-excerpt">
                  <RichTextPreviewLight content={featuredPost.excerpt} />
                </div>
                <Link
                  href={`/blog/${featuredPost.slug}`}
                  className="btn btn-d"
                  style={{ marginTop: '20px' }}
                >
                  Read Full Article
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ── Posts Grid ────────────────────────────── */}
        <section className="sec">
          <div className="wrap">
            {error && <p className="blog-status err">{String(error)}</p>}
            {!error && (
              <BlogPostsGrid
                initialPosts={posts}
                initialPagination={pagination}
                excludeId={featuredPost ? (featuredPost._id || featuredPost.id) : null}
                pageSize={PAGE_SIZE}
              />
            )}
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────── */}
        <section className="cta-sec">
          <div className="wrap" style={{ textAlign: 'center' }}>
            <h2 className="h2" style={{ color: '#fff', marginBottom: '16px' }}>Ready to Get Started?</h2>
            <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', marginBottom: '36px', maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto' }}>
              Join the growing community of businesses elevating their digital experience with SilverSurfers.ai
            </p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <Link href="/?openScan=1" className="btn btn-p">
                Get Quick Scan Report
              </Link>
              <Link href="/contact" className="btn btn-g">
                Contact Us
              </Link>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}
