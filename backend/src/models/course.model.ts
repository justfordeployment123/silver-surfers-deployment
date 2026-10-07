import mongoose from 'mongoose';

const lessonDownloadSchema = new mongoose.Schema({
  label: { type: String, required: true },
  s3Key: { type: String, required: true },
}, { _id: false });

const lessonSchema = new mongoose.Schema({
  lessonId: { type: String, required: true },
  title: { type: String, required: true },
  // Milestone 3.1 source doc, section 3.2: "continue hosting lesson videos
  // on YouTube initially" — no native video pipeline for 3.1 (Module 4's
  // recommendation). Unlisted YouTube videos, not a CDN-hosted file.
  youtubeId: { type: String },
  description: { type: String },
  // Source doc 3.2: "support module content beyond video, including
  // downloadable tools/templates."
  downloads: { type: [lessonDownloadSchema], default: [] },
  order: { type: Number, required: true },
}, { _id: false });

const courseModuleSchema = new mongoose.Schema({
  moduleId: { type: String, required: true },
  title: { type: String, required: true },
  order: { type: Number, required: true },
  lessons: { type: [lessonSchema], default: [] },
}, { _id: false });

// Embedded modules/lessons, not a job/run-style split (Module 4) — course
// structure changes rarely, unlike CourseProgress which changes on every
// lesson a customer completes.
const courseSchema = new mongoose.Schema({
  slug: {
    type: String, required: true, unique: true, trim: true, lowercase: true,
  },
  title: { type: String, required: true },
  modules: { type: [courseModuleSchema], default: [] },
}, { timestamps: true });

const Course = (mongoose.models.Course as mongoose.Model<unknown> | undefined)
  || mongoose.model('Course', courseSchema);

export default Course;
