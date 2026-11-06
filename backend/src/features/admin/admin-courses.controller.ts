import type { Request, Response } from 'express';
import mongoose from 'mongoose';

import Course from '../../models/course.model.ts';
import { normalizeCourseUpdate } from './admin-courses.validation.ts';

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
    update = normalizeCourseUpdate(request.body);
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
