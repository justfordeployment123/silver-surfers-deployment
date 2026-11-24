// Course card images uploaded from the admin Courses panel. Stored in MongoDB
// (see course-image.model.ts) and served publicly, so the contents are checked
// rather than trusting the declared type.
export const MAX_COURSE_IMAGE_BYTES = 5 * 1024 * 1024;

export type CourseImageType = 'image/svg+xml' | 'image/png' | 'image/jpeg' | 'image/webp';

const MAGIC: Record<Exclude<CourseImageType, 'image/svg+xml'>, (b: Buffer) => boolean> = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

const UNSAFE_SVG = /<script|<foreignObject|\son[a-z]+\s*=|javascript:/i;

export function validateCourseImage(contentType: unknown, data: Buffer | undefined): CourseImageType {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'].includes(type)) {
    throw new Error('Upload a PNG, JPEG, WebP or SVG image.');
  }
  if (!Buffer.isBuffer(data) || data.length === 0) throw new Error('Choose an image to upload.');
  if (data.length > MAX_COURSE_IMAGE_BYTES) throw new Error('The image must be 5 MB or smaller.');

  if (type === 'image/svg+xml') {
    const text = data.toString('utf8');
    if (!/<svg[\s>]/i.test(text.slice(0, 2048))) throw new Error('The file does not match the SVG type.');
    if (UNSAFE_SVG.test(text)) throw new Error('SVG images cannot contain scripts. Export a plain SVG and try again.');
    return 'image/svg+xml';
  }
  if (!MAGIC[type as keyof typeof MAGIC](data)) throw new Error(`The file does not match the ${type.split('/')[1].toUpperCase()} type.`);
  return type as CourseImageType;
}
