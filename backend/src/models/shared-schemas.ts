import mongoose from 'mongoose';

export const wcagReferenceSchema = new mongoose.Schema({
  criterion: { type: String },
  title: { type: String },
  level: { type: String, enum: ['A', 'AA', 'AAA'] },
  version: { type: String, enum: ['2.0', '2.1', '2.2'] },
  principle: { type: String, enum: ['perceivable', 'operable', 'understandable', 'robust'] },
  guideline: { type: String },
  url: { type: String },
  source: { type: String, enum: ['axe-core', 'silver-surfers', 'scanner'] },
}, { _id: false });

export const auditIssueSchema = new mongoose.Schema({
  auditId: { type: String },
  title: { type: String },
  description: { type: String },
  score: { type: Number, default: 0 },
  weight: { type: Number, default: 0 },
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  auditSourceType: { type: String, enum: ['wcag-aa', 'aging-heuristic', 'supporting-signal'], default: 'supporting-signal' },
  auditSourceLabel: { type: String, default: 'Supporting Signal' },
  wcagCriteria: { type: [String], default: [] },
  wcagReferences: { type: [wcagReferenceSchema], default: [] },
  wcagPrinciples: { type: [String], enum: ['perceivable', 'operable', 'understandable', 'robust'], default: [] },
  displayValue: { type: mongoose.Schema.Types.Mixed },
  sourceUrl: { type: String },
}, { _id: false });

export const dimensionScoreSchema = new mongoose.Schema({
  key: { type: String },
  label: { type: String },
  score: { type: Number, default: 0 },
  weight: { type: Number, default: 0 },
  issueCount: { type: Number, default: 0 },
  topIssues: { type: [auditIssueSchema], default: [] },
}, { _id: false });

export const platformScoreSchema = new mongoose.Schema({
  key: { type: String },
  label: { type: String },
  score: { type: Number, default: 0 },
  pageCount: { type: Number, default: 0 },
}, { _id: false });

export const wcagSummarySchema = new mongoose.Schema({
  totalIssues: { type: Number, default: 0 },
  criteriaCount: { type: Number, default: 0 },
  byPrinciple: {
    perceivable: { type: Number, default: 0 },
    operable: { type: Number, default: 0 },
    understandable: { type: Number, default: 0 },
    robust: { type: Number, default: 0 },
  },
  byLevel: {
    A: { type: Number, default: 0 },
    AA: { type: Number, default: 0 },
    AAA: { type: Number, default: 0 },
  },
  criteria: { type: [wcagReferenceSchema], default: [] },
}, { _id: false });

export const storedObjectSchema = new mongoose.Schema({
  filename: { type: String },
  key: { type: String },
  size: { type: Number },
  sizeMB: { type: String },
  fileId: { type: String },
  providerUrl: { type: String },
  downloadUrl: { type: String },
  downloadTokenHash: { type: String },
  downloadTokenExpiresAt: { type: Date },
}, { _id: false });

export const reportFileSchema = new mongoose.Schema({
  id: { type: String },
  filename: { type: String },
  relativePath: { type: String },
  storageKey: { type: String },
  providerUrl: { type: String },
  size: { type: Number },
  sizeMB: { type: String },
  contentType: { type: String, default: 'application/pdf' },
}, { _id: false });

export const reportStorageSchema = new mongoose.Schema({
  provider: { type: String },
  bucket: { type: String },
  region: { type: String },
  prefix: { type: String },
  objectCount: { type: Number, default: 0 },
  signedUrlExpiresInSeconds: { type: Number },
  objects: { type: [storedObjectSchema], default: [] },
}, { _id: false });

export const emailTrackingSchema = new mongoose.Schema({
  trackingId: { type: String },
  sentAt: { type: Date },
  openedAt: { type: Date },
  lastOpenedAt: { type: Date },
  openCount: { type: Number, default: 0 },
  clickedAt: { type: Date },
  lastClickedAt: { type: Date },
  clickCount: { type: Number, default: 0 },
  lastUserAgent: { type: String },
  lastIp: { type: String },
}, { _id: false });

export const aiReportSchema = new mongoose.Schema({
  status: { type: String, enum: ['generated', 'fallback'], default: 'fallback' },
  provider: { type: String, enum: ['openai', 'local'], default: 'local' },
  model: { type: String },
  generatedAt: { type: Date },
  headline: { type: String },
  summary: { type: String },
  businessImpact: { type: String },
  prioritySummary: { type: String },
  topRecommendations: { type: [String], default: [] },
  perFindingGuidance: {
    type: [{
      auditId: { type: String },
      title: { type: String },
      explanation: { type: String },
      remediation: { type: String },
      wcagCriteria: { type: [String], default: [] },
    }],
    default: [],
  },
  stakeholderNote: { type: String },
}, { _id: false });

export const scoreCardSchema = new mongoose.Schema({
  methodologyVersion: { type: String },
  categoryId: { type: String },
  overallScore: { type: Number, default: 0 },
  riskTier: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  scoreStatus: { type: String, enum: ['pass', 'needs-improvement', 'fail'], default: 'needs-improvement' },
  pageCount: { type: Number, default: 0 },
  evaluatedAt: { type: Date },
  dimensions: { type: [dimensionScoreSchema], default: [] },
  evaluationDimensions: { type: [dimensionScoreSchema], default: [] },
  topIssues: { type: [auditIssueSchema], default: [] },
  issues: { type: [auditIssueSchema], default: [] },
  platforms: { type: [platformScoreSchema], default: [] },
  wcagSummary: { type: wcagSummarySchema, default: undefined },
}, { _id: false });
