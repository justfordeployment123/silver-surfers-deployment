import { Router } from 'express';

import AnalysisRecord from '../../models/analysis-record.model.ts';
import BlogPost from '../../models/blog-post.model.ts';
import ContactMessage from '../../models/contact-message.model.ts';
import FAQ from '../../models/faq.model.ts';
import Service from '../../models/service.model.ts';
import { asyncHandler } from '../../shared/http/async-handler.ts';
import { adminRequired } from '../auth/admin.middleware.ts';
import { authRequired } from '../auth/auth.middleware.ts';
import {
  bulkQuickScans,
  getQuickScans,
  getSubscriptionScans,
  getUser,
  getUsers,
  rerunAnalysis,
  resetUserUsage,
  toggleInternalFlag,
  updateUserStatus,
  updateUserRole,
  updateUserSubscription,
} from './admin.controller.ts';

const router = Router();

router.use(authRequired, adminRequired);

// Pagination is opt-in via `page` here too (see content.routes.ts's public
// /blogs for the same reasoning) — the still-running CRA admin pages call
// this with no params and expect every post back.
router.get('/blog', asyncHandler(async (request, response) => {
  if (request.query.page === undefined) {
    const items = await BlogPost.find().sort({ createdAt: -1 }).lean();
    response.json({ items, total: items.length, page: 1, limit: items.length, pages: 1 });
    return;
  }

  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(request.query.limit) || 20), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    BlogPost.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    BlogPost.countDocuments(),
  ]);

  response.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
}));

router.post('/blog', asyncHandler(async (request, response) => {
  let { title, slug, excerpt, content, category, author, date, readTime, featured, published } = request.body ?? {};
  if (!title || !slug) {
    response.status(400).json({ error: 'Title and slug are required to create a blog post.' });
    return;
  }

  slug = String(slug).toLowerCase().trim();
  const payload = {
    title: String(title).trim(),
    slug,
    excerpt: String(excerpt || ''),
    content: String(content || ''),
    category: String(category || ''),
    author: String(author || ''),
    date: date ? new Date(date) : undefined,
    readTime: String(readTime || ''),
    featured: !!featured,
    published: !!published,
  };

  try {
    const created = await BlogPost.create(payload);
    response.status(201).json({ item: created });
  } catch (error) {
    const duplicateError = error as { code?: number; keyValue?: { slug?: string }; message?: string; name?: string; errors?: Record<string, { message?: string }> };

    if (duplicateError.code === 11000) {
      const duplicateSlug = duplicateError.keyValue?.slug || slug;
      response.status(400).json({
        error: `The blog URL slug "${duplicateSlug}" is already being used by another post. Please choose a different slug (or slightly change the title).`,
      });
      return;
    }

    if (duplicateError.name === 'ValidationError') {
      const messages = Object.values(duplicateError.errors || {}).map((item) => item.message).filter(Boolean);
      response.status(400).json({
        error: messages.length
          ? `There was a problem with your blog post: ${messages.join(' ')}`
          : 'There was a problem with the blog data you entered. Please review the fields and try again.',
      });
      return;
    }

    throw error;
  }
}));

router.put('/blog/:id', asyncHandler(async (request, response) => {
  const body = request.body ?? {};
  const update: Record<string, unknown> = {};

  if (body.title != null) update.title = String(body.title).trim();
  if (body.slug != null) update.slug = String(body.slug).toLowerCase().trim();
  if (body.excerpt != null) update.excerpt = String(body.excerpt);
  if (body.content != null) update.content = String(body.content);
  if (body.category != null) update.category = String(body.category);
  if (body.author != null) update.author = String(body.author);
  if (body.date != null) update.date = body.date ? new Date(body.date) : undefined;
  if (body.readTime != null) update.readTime = String(body.readTime);
  if (body.featured != null) update.featured = !!body.featured;
  if (body.published != null) update.published = !!body.published;

  const updated = await BlogPost.findByIdAndUpdate(String(request.params.id || ''), update, { new: true });
  if (!updated) {
    response.status(404).json({ error: 'We could not find that blog post. It may have been deleted.' });
    return;
  }

  response.json({ item: updated });
}));

router.delete('/blog/:id', asyncHandler(async (request, response) => {
  const deleted = await BlogPost.findByIdAndDelete(String(request.params.id || ''));
  if (!deleted) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  response.json({ ok: true });
}));

router.get('/services', asyncHandler(async (request, response) => {
  if (request.query.page === undefined) {
    const items = await Service.find().sort({ createdAt: -1 }).lean();
    response.json({ items, total: items.length, page: 1, limit: items.length, pages: 1 });
    return;
  }

  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(request.query.limit) || 20), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Service.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Service.countDocuments(),
  ]);

  response.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
}));

router.post('/services', asyncHandler(async (request, response) => {
  const { name, slug, description, priceCents, active } = request.body ?? {};
  if (!name || !slug) {
    response.status(400).json({ error: 'name and slug required' });
    return;
  }

  const created = await Service.create({
    name,
    slug,
    description,
    priceCents: Number(priceCents) || 0,
    active: active !== false,
  });

  response.status(201).json({ item: created });
}));

router.put('/services/:id', asyncHandler(async (request, response) => {
  const updated = await Service.findByIdAndUpdate(String(request.params.id || ''), request.body, { new: true });
  if (!updated) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  response.json({ item: updated });
}));

router.delete('/services/:id', asyncHandler(async (request, response) => {
  const deleted = await Service.findByIdAndDelete(String(request.params.id || ''));
  if (!deleted) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  response.json({ ok: true });
}));

router.get('/faqs', asyncHandler(async (request, response) => {
  if (request.query.page === undefined) {
    const items = await FAQ.find().sort({ order: 1, createdAt: -1 }).lean();
    response.json({ items, total: items.length, page: 1, limit: items.length, pages: 1 });
    return;
  }

  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(request.query.limit) || 20), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    FAQ.find().sort({ order: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    FAQ.countDocuments(),
  ]);

  response.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
}));

router.post('/faqs', asyncHandler(async (request, response) => {
  const { question, answer, order, published } = request.body ?? {};
  if (!question || typeof question !== 'string') {
    response.status(400).json({ error: 'question required' });
    return;
  }

  const created = await FAQ.create({
    question: question.trim(),
    answer: typeof answer === 'string' ? answer : '',
    order: Number(order) || 0,
    published: published !== false,
  });

  response.status(201).json({ item: created });
}));

router.put('/faqs/:id', asyncHandler(async (request, response) => {
  const body = request.body ?? {};
  const update: Record<string, unknown> = {};

  if (body.question != null) update.question = String(body.question).trim();
  if (body.answer != null) update.answer = String(body.answer);
  if (body.order != null) update.order = Number(body.order) || 0;
  if (body.published != null) update.published = !!body.published;

  const updated = await FAQ.findByIdAndUpdate(String(request.params.id || ''), update, { new: true });
  if (!updated) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  response.json({ item: updated });
}));

router.delete('/faqs/:id', asyncHandler(async (request, response) => {
  const deleted = await FAQ.findByIdAndDelete(String(request.params.id || ''));
  if (!deleted) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  response.json({ ok: true });
}));

router.get('/analysis', asyncHandler(async (request, response) => {
  const { email, url, status, emailStatus, limit, page } = request.query ?? {};
  const query: Record<string, unknown> = {};
  if (email) query.email = String(email);
  if (url) query.url = String(url);
  if (status) query.status = String(status);
  if (emailStatus) query.emailStatus = String(emailStatus);

  if (page === undefined) {
    // Back-compat: old callers pass only `limit` and expect a plain array,
    // with no `skip`/`total` — same shape as before, just now also with
    // the pagination metadata attached for callers that read it.
    const cappedLimit = Number(limit) || 100;
    const [items, total] = await Promise.all([
      AnalysisRecord.find(query).sort({ createdAt: -1 }).limit(cappedLimit).lean(),
      AnalysisRecord.countDocuments(query),
    ]);
    response.json({ items, total, page: 1, limit: cappedLimit, pages: Math.ceil(total / cappedLimit) || 1 });
    return;
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(Math.max(1, Number(limit) || 100), 500);
  const skip = (pageNum - 1) * pageLimit;

  const [items, total] = await Promise.all([
    AnalysisRecord.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageLimit).lean(),
    AnalysisRecord.countDocuments(query),
  ]);

  response.json({ items, total, page: pageNum, limit: pageLimit, pages: Math.ceil(total / pageLimit) || 1 });
}));

router.get('/analysis/:taskId', asyncHandler(async (request, response) => {
  const item = await AnalysisRecord.findOne({ taskId: String(request.params.taskId || '') }).lean();
  if (!item) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  response.json({ item });
}));

router.get('/contact', asyncHandler(async (request, response) => {
  const { status, q, limit, page } = request.query ?? {};
  const filter: Record<string, unknown> = {};
  if (status && ['new', 'read', 'closed'].includes(String(status))) {
    filter.status = String(status);
  }

  // Search now runs inside the Mongo query instead of loading up to `limit`
  // docs and filtering them in Node — the old in-memory filter also meant
  // a search term could shrink the result set below what was actually
  // fetched (e.g. matching only 3 of the 200 loaded), with no way to load
  // "page 2" of real matches. $or/$regex here searches the full collection.
  const term = String(q || '').trim();
  if (term) {
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { subject: { $regex: term, $options: 'i' } },
      { message: { $regex: term, $options: 'i' } },
    ];
  }

  if (page === undefined) {
    const cappedLimit = Number(limit) || 200;
    const [items, total] = await Promise.all([
      ContactMessage.find(filter).sort({ createdAt: -1 }).limit(cappedLimit).lean(),
      ContactMessage.countDocuments(filter),
    ]);
    response.json({ items, total, page: 1, limit: cappedLimit, pages: Math.ceil(total / cappedLimit) || 1 });
    return;
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
  const skip = (pageNum - 1) * pageLimit;

  const [items, total] = await Promise.all([
    ContactMessage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageLimit).lean(),
    ContactMessage.countDocuments(filter),
  ]);

  response.json({ items, total, page: pageNum, limit: pageLimit, pages: Math.ceil(total / pageLimit) || 1 });
}));

router.get('/contact/:id', asyncHandler(async (request, response) => {
  const item = await ContactMessage.findById(String(request.params.id || '')).lean();
  if (!item) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  response.json({ item });
}));

router.put('/contact/:id', asyncHandler(async (request, response) => {
  const { status, subject, message, name, email } = request.body ?? {};
  const update: Record<string, unknown> = {};

  if (status != null) update.status = ['new', 'read', 'closed'].includes(String(status)) ? String(status) : 'new';
  if (subject != null) update.subject = String(subject);
  if (message != null) update.message = String(message);
  if (name != null) update.name = String(name);
  if (email != null) update.email = String(email);

  const item = await ContactMessage.findByIdAndUpdate(String(request.params.id || ''), update, { new: true });
  if (!item) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  response.json({ item });
}));

router.delete('/contact/:id', asyncHandler(async (request, response) => {
  const deleted = await ContactMessage.findByIdAndDelete(String(request.params.id || ''));
  if (!deleted) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  response.json({ ok: true });
}));

router.post('/analysis/:idOrTaskId/rerun', asyncHandler(rerunAnalysis));
router.get('/quick-scans', asyncHandler(getQuickScans));
router.post('/quick-scans/bulk', asyncHandler(bulkQuickScans));
router.get('/subscription-scans', asyncHandler(getSubscriptionScans));
router.get('/users', asyncHandler(getUsers));
router.get('/users/:id', asyncHandler(getUser));
router.post('/users/:id/reset-usage', asyncHandler(resetUserUsage));
router.put('/users/:id/role', asyncHandler(updateUserRole));
router.put('/users/:id/status', asyncHandler(updateUserStatus));
router.put('/users/:id/internal', asyncHandler(toggleInternalFlag));
router.post('/subscription/update', asyncHandler(updateUserSubscription));

export default router;
