export interface LiteAccessibilityReportResult {
  reportPath: string;
  score: string | number;
}

export function generateLiteAccessibilityReport(
  inputFile: string,
  outputDirectory: string,
  options?: { wcagStandard?: string | null; conformanceLevel?: string | null },
): Promise<LiteAccessibilityReportResult>;
