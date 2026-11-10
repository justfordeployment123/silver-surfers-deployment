import type { Request, Response } from 'express';
import mongoose from 'mongoose';

import Course from '../../models/course.model.ts';
import { normalizeCourseUpdate } from './admin-courses.validation.ts';
import { normalizeCourseDetails, validateCoursePrice } from '../courses/course-catalog.ts';
import { getStripeClient } from '../billing/stripe-client.ts';

async function coursePayload(body: any, existing?: any) {
  const content = normalizeCourseUpdate(body);
  const details = normalizeCourseDetails({...existing,...body,...content,slug:existing?.slug || body.slug});
  const price = details.stripePriceId ? validateCoursePrice(await getStripeClient().prices.retrieve(details.stripePriceId)) : {priceCents:null,currency:null};
  return {...content,...details,...price};
}

export async function createAdminCourse(request: Request, response: Response): Promise<void> {
  try {
    const payload = await coursePayload(request.body);
    const course = await Course.create(payload);
    response.status(201).json({course});
  } catch(error: any) { response.status(400).json({error:error.code === 11000 ? 'That course slug already exists.' : error.message}); }
}

function courseFilter(idOrSlug: string): Record<string, unknown> {
  return mongoose.isValidObjectId(idOrSlug)
    ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug.toLowerCase() }] }
    : { slug: idOrSlug.toLowerCase() };
}

export async function listAdminCourses(_request: Request, response: Response): Promise<void> {
  const items = await Course.find().sort({ title: 1 }).lean();
  response.json({ items });
}

export async function getAdminCourse(request: Request, response: Response): Promise<void> {
  const course = await Course.findOne(courseFilter(String(request.params.idOrSlug || ''))).lean();
  if (!course) {
    response.status(404).json({ error: 'Course not found.' });
    return;
  }
  response.json({ course });
}

export async function updateAdminCourse(request: Request, response: Response): Promise<void> {
  let update;
  try {
    const existing = await Course.findOne(courseFilter(String(request.params.idOrSlug || ''))).lean();
    if (!existing) { response.status(404).json({error:'Course not found.'}); return; }
    update = await coursePayload(request.body,existing);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid course details.' });
    return;
  }

  const course = await Course.findOneAndUpdate(
    courseFilter(String(request.params.idOrSlug || '')),
    { $set: update },
    { new: true, runValidators: true },
  );
  if (!course) {
    response.status(404).json({ error: 'Course not found.' });
    return;
  }
  response.json({ course });
}
