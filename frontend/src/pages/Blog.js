import React, { useEffect, useMemo, useState } from 'react';
import { fetchJSON } from '../config/apiBase';
import { RichTextPreviewLight } from '../components/RichTextEditor';

const Blog = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      const { ok, data } = await fetchJSON('/blogs?published=true');
      if (!active) return;
      if (ok) {
        const items = Array.isArray(data.items) ? data.items : (data.blogs || data.posts || []);
        setPosts(items);
        setLoading(false);
      } else {
        setError(data?.error || 'Failed to load posts');
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const featuredPost = useMemo(() => {
    if (!posts.length) return null;
    const explicitlyFeatured = posts.find(post => post.featured === true);
    if (explicitlyFeatured) return explicitlyFeatured;
    return posts[0];
  }, [posts]);

  const regularPosts = posts.filter(post => post !== featuredPost);

  const navigateToPost = (slug) => { window.location.href = `/blog/${slug}`; };
  const navigateToHome = () => { window.location.href = '/?openScan=1'; };
  const navigateToContact = () => { window.location.href = '/contact'; };

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
        {featuredPost && !loading && (
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
                <button
                  type="button"
                  onClick={() => navigateToPost(featuredPost.slug)}
                  className="btn btn-d"
                  style={{ marginTop: '20px' }}
                >
                  Read Full Article
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Posts Grid ────────────────────────────── */}
        <section className="sec">
          <div className="wrap">
            {loading && <p className="blog-status">Loading posts…</p>}
            {error && <p className="blog-status err">{String(error)}</p>}
            {!loading && !error && regularPosts.length > 0 ? (
              <div className="g3">
                {regularPosts.map((post, index) => (
                  <article key={post._id || post.id || index} className="card">
                    <div className="card-bar" />
                    <span className="tag">
                      {(post.category || 'general').replace('-', ' ').toUpperCase()}
                    </span>
                    <h3 className="h3" style={{ marginTop: '10px', marginBottom: '8px' }}>{post.title}</h3>
                    <div className="blog-post-excerpt">
                      <RichTextPreviewLight content={post.excerpt} />
                    </div>
                    <div className="blog-meta">
                      {post.author && <span>By {post.author}</span>}
                      {(post.createdAt || post.date) && (
                        <span>{new Date(post.createdAt || post.date).toLocaleDateString()}</span>
                      )}
                      {post.readTime && <span>{post.readTime}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => navigateToPost(post.slug)}
                      className="card-lnk"
                    >
                      Read More →
                    </button>
                  </article>
                ))}
              </div>
            ) : (!loading && !error && (
              <div className="blog-no-posts">
                <div className="blog-no-posts-icon">
                  <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h3 className="h3" style={{ marginBottom: '8px' }}>No posts found</h3>
                <p style={{ fontSize: '16px', color: 'var(--ink6)' }}>Check back later for new content.</p>
              </div>
            ))}
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
              <button type="button" onClick={navigateToHome} className="btn btn-p">
                Get Quick Scan Report
              </button>
              <button type="button" onClick={navigateToContact} className="btn btn-g">
                Contact Us
              </button>
            </div>
          </div>
        </section>

      </div>
    </>
  );
};

export default Blog;
