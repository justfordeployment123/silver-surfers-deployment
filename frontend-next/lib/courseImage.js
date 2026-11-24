// Course card images uploaded from the admin Courses panel. Mirrors the
// backend limits so the picker can explain a problem before uploading.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'];

export function validateImageFile(file) {
  if (!file) return 'Choose an image to upload.';
  if (!TYPES.includes(file.type)) return 'Upload a PNG, JPEG, WebP or SVG image.';
  if (file.size > MAX_IMAGE_BYTES) return 'The image must be 5 MB or smaller.';
  return '';
}

// Uploaded image first, then artwork bundled with the site, then a default.
export function courseImageSrc(course, bundled, fallback, apiBase) {
  const url = course?.imageUrl;
  if (url) return /^https?:\/\//.test(url) ? url : `${apiBase}${url}`;
  return bundled[course?.slug] || fallback;
}
