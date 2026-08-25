'use client';

// Phase 4: the public /blog listing gets a "Load more" button rather than
// numbered pages — the migration plan calls this out explicitly as the
// more accessible, predictable choice for this app's audience (no
// infinite-scroll auto-triggering). Server-rendered first page (passed in
// as initialPosts/initialPagination from app/(site)/blog/page.js) means the
// page still has real content on first paint; this component only takes
// over for page 2+, fetched client-side via the same public /blogs
// endpoint the server used.
import { useState } from 'react';
import Link from 'next/link';
import RichTextPreviewLight from '../RichTextPreviewLight';
import { fetchJSON } from '../../lib/publicApi';

export default function BlogPostsGrid({ initialPosts, initialPagination, excludeId, pageSize }) {
  const [posts, setPosts] = useState(initialPosts);
  const [pagination, setPagination] = useState(initialPagination);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const regularPosts = posts.filter((post) => (post._id || post.id) !== excludeId);
  const hasMore = (pagination.page || 1) < (pagination.pages || 1);

  const loadMore = async () => {
    setLoadingMore(true);
    setError('');
    const nextPage = (pagination.page || 1) + 1;
    const { ok, data } = await fetchJSON(`/blogs?published=true&page=${nextPage}&limit=${pageSize}`);
    if (!ok) {
      setError(data?.error || 'Failed to load more posts');
      setLoadingMore(false);
      return;
    }
    const items = Array.isArray(data.items) ? data.items : [];
    setPosts((prev) => [...prev, ...items]);
    setPagination({
      total: Number(data.total) || pagination.total,
      page: Number(data.page) || nextPage,
      limit: Number(data.limit) || pageSize,
      pages: Math.max(1, Number(data.pages) || pagination.pages),
    });
    setLoadingMore(false);
  };

  if (regularPosts.length === 0) {
    return (
      <div className="blog-no-posts">
        <div className="blog-no-posts-icon">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <h3 className="h3" style={{ marginBottom: '8px' }}>No posts found</h3>
        <p style={{ fontSize: '16px', color: 'var(--ink6)' }}>Check back later for new content.</p>
      </div>
    );
  }

  return (
    <>
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
            <Link href={`/blog/${post.slug}`} className="card-lnk">
              Read More
            </Link>
          </article>
        ))}
      </div>

      {error && <p className="blog-status err">{error}</p>}

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: '32px' }}>
          <button type="button" onClick={loadMore} disabled={loadingMore} className="btn btn-o">
            {loadingMore ? 'Loading…' : 'Load More Posts'}
          </button>
        </div>
      )}
    </>
  );
}
