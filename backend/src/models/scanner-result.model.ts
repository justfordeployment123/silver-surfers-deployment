import mongoose from 'mongoose';

const scannerResultSchema = new mongoose.Schema({
  scannerJobId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  queueKind: {
    type: String,
    enum: ['quick', 'full'],
    required: true,
    index: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  receivedAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    expires: 0,
  },
}, {
  timestamps: true,
});

const ScannerResult = (mongoose.models.ScannerResult as mongoose.Model<unknown> | undefined)
  || mongoose.model('ScannerResult', scannerResultSchema);

export default ScannerResult;
