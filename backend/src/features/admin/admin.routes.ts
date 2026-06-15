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
  updateUserStatus,
  updateUserRole,
  updateUserSubscription,
} from './admin.controller.ts';

const router = Router();

router.use(authRequired, adminRequired);

router.get('/blog', asyncHandler(async (_request, response) => {
  const items = await BlogPost.find().sort({ createdAt: -1 }).lean();
  response.json({ items });
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

router.get('/services', asyncHandler(async (_request, response) => {
  const items = await Service.find().sort({ createdAt: -1 }).lean();
  response.json({ items });
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

router.get('/faqs', asyncHandler(async (_request, response) => {
  const items = await FAQ.find().sort({ order: 1, createdAt: -1 }).lean();
  response.json({ items });
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
  const { email, url, status, emailStatus, limit } = request.query ?? {};
  const query: Record<string, unknown> = {};
  if (email) query.email = String(email);
  if (url) query.url = String(url);
  if (status) query.status = String(status);
  if (emailStatus) query.emailStatus = String(emailStatus);

  const items = await AnalysisRecord.find(query).sort({ createdAt: -1 }).limit(Number(limit) || 100).lean();
  response.json({ items });
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
  const { status, q, limit = 200 } = request.query ?? {};
  const filter: Record<string, unknown> = {};
  if (status && ['new', 'read', 'closed'].includes(String(status))) {
    filter.status = String(status);
  }

  const items = await ContactMessage.find(filter).sort({ createdAt: -1 }).limit(Number(limit) || 200).lean();
  const term = String(q || '').trim().toLowerCase();
  const filtered = term
    ? items.filter((item) => [item.name, item.email, item.subject, item.message].some((value) => String(value || '').toLowerCase().includes(term)))
    : items;

  response.json({ items: filtered });
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
router.post('/subscription/update', asyncHandler(updateUserSubscription));

export default router;
