import mongoose from 'mongoose';

// Card image for a course, kept out of the Course document so course list
// queries never load image bytes.
const courseImageSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, unique: true },
  contentType: { type: String, required: true },
  data: { type: Buffer, required: true },
  size: { type: Number, required: true },
}, { timestamps: true });

const CourseImage = (mongoose.models.CourseImage as mongoose.Model<unknown> | undefined)
  || mongoose.model('CourseImage', courseImageSchema);

export default CourseImage;
