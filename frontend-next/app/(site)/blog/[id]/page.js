// Ported from frontend/src/pages/BlogPost.js. Server Component — no client
// JS needed at all (pure display + navigation links), unlike the original
// which fetched client-side and showed a skeleton loading state (moot now
// that the fetch happens before the page is sent).
//
// The route param is named [id] to match the original react-router path
// (/blog/:id), but frontend/src/pages/BlogPost.js already treated it as a
// SLUG (fetchJSON(`/blogs/${slug}`)), not a Mongo ObjectId — same here.
//
// Bug fix while porting: the original used the dark (white-text)
// RichTextPreviewDark for BOTH the excerpt banner (on the dark page
// background, correct) AND the main post content (inside a light
// var(--surface) card — white-on-white, illegible). Content now uses
// RichTextPreviewLight instead; only the excerpt keeps the dark variant.
import Link from 'next/link';
import RichTextPreviewDark from '../../../../components/RichTextPreviewDark';
import RichTextPreviewLight from '../../../../components/RichTextPreviewLight';
import { fetchJSON } from '../../../../lib/publicApi';

async function getPost(slug) {
  const { ok, data } = await fetchJSON(`/blogs/${slug}`, { next: { revalidate: 60 } });
  if (!ok) {
    return { post: null, error: data?.error || 'Failed to load blog post' };
  }
  return { post: data.post, error: null };
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const { post } = await getPost(id);
  if (!post) return { title: 'Blog | SilverSurfers' };
  return {
    title: `${post.title} | SilverSurfers Blog`,
    description: post.excerpt ? post.excerpt.slice(0, 160) : undefined,
  };
}

export default async function BlogPostPage({ params }) {
  const { id } = await params;
  const { post, error } = await getPost(id);

  if (error || !post) {
    return (
      <>
        <style>{`.bp-page { background: var(--t9); min-height: 100vh; }`}</style>
        <div className="bp-page" style={{ paddingTop: '160px', paddingBottom: '60px', textAlign: 'center' }}>
          <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 24px' }}>
            <p style={{ color: 'rgba(255, 255, 255, 0.75)', marginBottom: '20px' }}>{error || 'Post not found.'}</p>
            <Link href="/blog" style={{ color: 'var(--t4)', textDecoration: 'none', fontSize: '16px' }}>
              ← Back to Blog
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        .bp-page { background: var(--t9); min-height: 100vh; }
        .bp-header { padding: 120px 0 52px; }
        .bp-back {
          display: inline-flex; align-items: center; gap: 6px;
          color: rgba(255,255,255,0.75); font-size: 16px; text-decoration: none;
          margin-bottom: 28px; transition: color 0.15s;
        }
        .bp-back:hover { color: rgba(255,255,255,0.9); }
        .bp-title {
          color: #fff;
          font-family: var(--ffd);
          font-size: clamp(26px, 4vw, 42px);
          font-weight: 700;
          line-height: 1.5;
          margin-bottom: 20px;
        }
        .bp-meta { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 4px; }
        .bp-meta-item { font-size: 16px; color: rgba(255,255,255,0.75); }
        .bp-excerpt {
          background: rgba(255,255,255,0.05);
          border-top: 1px solid rgba(255,255,255,0.08);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          padding: 28px 0;
          margin-bottom: 0;
        }
        .bp-excerpt-inner { font-size: 17px; color: rgba(255,255,255,0.78); line-height: 1.75; }
        .bp-content { padding: 48px 0; }
        .bp-content-card {
          background: var(--surface);
          border-radius: var(--rl);
          padding: 48px;
          box-shadow: 0 4px 28px rgba(4,46,34,0.12);
        }
        .bp-footer { padding: 0 0 56px; }
        .bp-footer-inner { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 24px; }
        @media (max-width: 600px) {
          .bp-content-card { padding: 24px 20px; }
        }
      `}</style>

      <div className="bp-page">

        {/* ── Header ───────────────────────────────── */}
        <div className="bp-header">
          <div className="wrap">
            <Link href="/blog" className="bp-back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Blog
            </Link>

            <h1 className="bp-title">{post.title}</h1>

            <div className="bp-meta">
              {post.category && <span className="tag">{post.category}</span>}
              {post.author && (
                <span className="bp-meta-item">By <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{post.author}</strong></span>
              )}
              {post.readTime && <span className="bp-meta-item">{post.readTime}</span>}
              {post.date && (
                <span className="bp-meta-item">
                  {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Excerpt ──────────────────────────────── */}
        {post.excerpt && (
          <div className="bp-excerpt">
            <div className="wrap">
              <div className="bp-excerpt-inner">
                <RichTextPreviewDark content={post.excerpt} />
              </div>
            </div>
          </div>
        )}

        {/* ── Content ──────────────────────────────── */}
        <div className="bp-content">
          <div className="wrap">
            <div className="bp-content-card">
              <article>
                {post.content ? (
                  <RichTextPreviewLight content={post.content} />
                ) : (
                  <p style={{ color: 'var(--ink6)', fontStyle: 'italic', textAlign: 'center', padding: '32px 0' }}>
                    No content available for this post.
                  </p>
                )}
              </article>
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────── */}
        <div className="bp-footer">
          <div className="wrap">
            <div className="bp-footer-inner">
              <Link href="/blog" className="bp-back">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Blog
              </Link>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
