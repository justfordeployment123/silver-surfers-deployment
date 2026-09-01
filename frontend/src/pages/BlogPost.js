import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchJSON } from '../config/apiBase';
import { RichTextPreviewDark } from '../components/RichTextEditor';

export default function BlogPost() {
  const { id: slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPost = async () => {
      try {
        setLoading(true); setError(null);
        const { ok, data } = await fetchJSON(`/blogs/${slug}`);
        if (ok) {
          setPost(data.post);
        } else {
          setError(data?.error || 'Failed to load blog post');
        }
      } catch (err) {
        setError('Failed to load blog post');
        console.error('Blog post fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    if (slug) fetchPost();
  }, [slug]);

  if (loading) {
    return (
      <>
        <style>{`
          .bp-page { background: var(--t9); min-height: 100vh; }
          .bp-skeleton { animation: bpPulse 1.4s ease-in-out infinite; }
          .bp-skel-line { background: rgba(255,255,255,0.08); border-radius: 6px; margin-bottom: 12px; }
          @keyframes bpPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        `}</style>
        <div className="bp-page" style={{ paddingTop: '160px', paddingBottom: '60px' }}>
          <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 24px' }} className="bp-skeleton">
            <div className="bp-skel-line" style={{ height: '32px', width: '75%', marginBottom: '16px' }} />
            <div className="bp-skel-line" style={{ height: '16px', width: '50%', marginBottom: '32px' }} />
            <div className="bp-skel-line" style={{ height: '14px' }} />
            <div className="bp-skel-line" style={{ height: '14px', width: '83%' }} />
            <div className="bp-skel-line" style={{ height: '14px', width: '67%' }} />
          </div>
        </div>
      </>
    );
  }

  if (error || !post) {
    return (
      <>
        <style>{`.bp-page { background: var(--t9); min-height: 100vh; }`}</style>
        <div className="bp-page" style={{ paddingTop: '160px', paddingBottom: '60px', textAlign: 'center' }}>
          <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 24px' }}>
            <p style={{ color: 'rgba(255, 255, 255, 0.75)', marginBottom: '20px' }}>{error || 'Post not found.'}</p>
            <Link to="/blog" style={{ color: 'var(--t4)', textDecoration: 'none', fontSize: '16px' }}>
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
          line-height: 1.2;
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
          box-shadow: 0 4px 28px rgba(16,47,69,0.12);
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
            <Link to="/blog" className="bp-back">
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
                  <RichTextPreviewDark content={post.content} />
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
              <Link to="/blog" className="bp-back">
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
