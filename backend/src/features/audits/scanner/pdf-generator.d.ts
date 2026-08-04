export interface GenerateSeniorAccessibilityReportOptions {
  inputFile?: string;
  outputFile?: string;
  imagePaths?: Record<string, never>;
  url: string;
  email_address: string;
  outputDir?: string;
  device?: string;
  formFactor?: string;
  planType?: string;
  wcagMatrix?: unknown;
  wcagStandard?: string | null;
  conformanceLevel?: string | null;
}

export interface SeniorAccessibilityReportResult {
  reportPath: string;
  url: string;
  score: string | number;
}

export function generateSeniorAccessibilityReport(
  options?: GenerateSeniorAccessibilityReportOptions,
): Promise<SeniorAccessibilityReportResult>;
