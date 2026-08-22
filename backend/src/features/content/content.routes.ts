import { Router } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.ts';
import { getBlogPostModel, getFaqModel } from './content.dependencies.ts';

const router = Router();

// Pagination is opt-in via `page`: omitting it preserves the historical
// "return everything" behavior the still-running CRA frontend relies on
// (Blog.js/FAQ.js just read `data.items` with no page param). Passing
// `page` switches to a real skip/limit query with total/pages metadata,
// for the new frontend's "Load more" UI.
router.get('/blogs', asyncHandler(async (request, response) => {
  const BlogPost = await getBlogPostModel();
  const publishedOnly = request.query.published !== 'false';
  const query = publishedOnly ? { published: true } : {};

  if (request.query.page === undefined) {
    const items = await BlogPost.find(query).sort({ createdAt: -1 }).lean();
    response.json({ items, total: items.length, page: 1, limit: items.length, pages: 1 });
    return;
  }

  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(request.query.limit) || 10), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    BlogPost.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    BlogPost.countDocuments(query),
  ]);

  response.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
}));

router.get('/blogs/:slug', asyncHandler(async (request, response) => {
  const BlogPost = await getBlogPostModel();
  const publishedOnly = request.query.published !== 'false';
  const query: Record<string, unknown> = { slug: request.params.slug };

  if (publishedOnly) {
    query.published = true;
  }

  const post = await BlogPost.findOne(query).lean();
  if (!post) {
    response.status(404).json({ error: 'Blog post not found' });
    return;
  }

  response.json({ post });
}));

router.get('/faqs', asyncHandler(async (request, response) => {
  const FAQ = await getFaqModel();
  const publishedOnly = request.query.published !== 'false';
  const query = publishedOnly ? { published: true } : {};

  if (request.query.page === undefined) {
    const items = await FAQ.find(query).sort({ order: 1, createdAt: -1 }).lean();
    response.json({ items, total: items.length, page: 1, limit: items.length, pages: 1 });
    return;
  }

  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(request.query.limit) || 20), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    FAQ.find(query).sort({ order: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    FAQ.countDocuments(query),
  ]);

  response.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
}));

export default router;
