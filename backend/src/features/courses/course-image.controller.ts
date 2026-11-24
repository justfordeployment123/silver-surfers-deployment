import type { Request, Response } from 'express';

import Course from '../../models/course.model.ts';
import CourseImage from '../../models/course-image.model.ts';
import { courseFilter } from '../admin/admin-courses.controller.ts';
import { courseImageUrl } from './course-catalog.ts';
import { validateCourseImage } from './course-image.ts';

const adminCourse = (request: Request) => Course.findOne(courseFilter(String(request.params.idOrSlug || ''))).lean() as Promise<any>;

export async function uploadAdminCourseImage(request: Request, response: Response): Promise<void> {
  const course = await adminCourse(request);
  if (!course) { response.status(404).json({ error: 'Course not found.' }); return; }
  let contentType;
  try {
    contentType = validateCourseImage(request.headers['content-type'], request.body);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid image.' });
    return;
  }
  const data: Buffer = request.body;
  const imageUpdatedAt = new Date();
  await CourseImage.updateOne({ courseId: course._id }, { $set: { contentType, data, size: data.length } }, { upsert: true });
  await Course.updateOne({ _id: course._id }, { $set: { imageUpdatedAt } });
  response.json({ imageUrl: courseImageUrl({ ...course, imageUpdatedAt }), imageUpdatedAt });
}

export async function deleteAdminCourseImage(request: Request, response: Response): Promise<void> {
  const course = await adminCourse(request);
  if (!course) { response.status(404).json({ error: 'Course not found.' }); return; }
  await CourseImage.deleteOne({ courseId: course._id });
  await Course.updateOne({ _id: course._id }, { $unset: { imageUpdatedAt: '' } });
  response.json({ imageUrl: '' });
}

export async function getPublicCourseImage(request: Request, response: Response): Promise<void> {
  const slug = String(request.params.slug || '').toLowerCase();
  const course = await (Course.findOne({ slug, status: 'published', imageUpdatedAt: { $exists: true } }).select('_id slug imageUpdatedAt').lean() as Promise<any>);
  const image = course ? await (CourseImage.findOne({ courseId: course._id }).lean() as Promise<any>) : null;
  if (!course || !image) { response.status(404).json({ error: 'Image not found.' }); return; }
  const etag = `"${image.size}-${new Date(course.imageUpdatedAt).getTime()}"`;
  response.set('ETag', etag);
  response.set('Cache-Control', 'public, max-age=300');
  if (request.headers['if-none-match'] === etag) { response.status(304).end(); return; }
  response.set('Content-Type', image.contentType);
  // An SVG opened directly must not be able to run script.
  response.set('X-Content-Type-Options', 'nosniff');
  response.set('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
  // lean() returns a BSON Binary whose bytes are on .buffer; a Buffer is used as is.
  response.status(200).send(Buffer.isBuffer(image.data) ? image.data : Buffer.from(image.data.buffer));
}
