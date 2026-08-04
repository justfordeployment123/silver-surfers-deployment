import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { buildAuditScorecard } from '../audit-scorecard.ts';
import { describeWcagStandardLabel } from '../wcag-mapping.ts';

// Helper to get __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lite version audit information - simplified
const LITE_AUDIT_INFO = {
    'color-contrast': {
        title: 'Color Contrast',
        category: 'Vision',
        impact: 'Essential for older adults with vision changes to read text clearly.',
    },
    'target-size': {
        title: 'Touch Target Size',
        category: 'Motor',
        impact: 'Larger buttons help older adults with tremors or arthritis.',
    },
    // CHANGE: Replace 'font-size' with 'text-font-audit' to match your custom audit
    'text-font-audit': {
        title: 'Font Size',
        category: 'Vision',
        impact: 'Larger fonts are crucial for older adults with presbyopia.',
    },
    'viewport': {
        title: 'Mobile Design',
        category: 'Technical',
        impact: 'Proper mobile display for older adults using tablets/phones.',
    },
    'link-name': {
        title: 'Link Text',
        category: 'Cognitive',
        impact: 'Clear link descriptions help older adults navigate confidently.',
    },
    'button-name': {
        title: 'Button Labels',
        category: 'Cognitive',
        impact: 'Descriptive button text prevents confusion for older adults.',
    },
    'label': {
        title: 'Form Labels',
        category: 'Cognitive',
        impact: 'Clear form labels help older adults complete tasks successfully.',
    },
    'heading-order': {
        title: 'Content Structure',
        category: 'Cognitive',
        impact: 'Logical headings reduce cognitive load for older adults.',
    },
    'is-on-https': {
        title: 'Security',
        category: 'Security',
        impact: 'Secure connections protect older adults from online scams.',
    },
    'user-scalable-audit': {
        title: 'Pinch-to-Zoom Allowed',
        category: 'Mobile',
        impact: 'Older adults can enlarge content on phones and tablets.',
    },
    'horizontal-scroll-audit': {
        title: 'No Horizontal Scrolling',
        category: 'Mobile',
        impact: 'Page fits the screen width without confusing side-scrolling.',
    },
    'text-size-adjust-audit': {
        title: 'Text Scaling Not Blocked',
        category: 'Mobile',
        impact: 'Browser can automatically adjust text size for readability.',
    },
    'cumulative-layout-shift': {
        title: 'Stable Layout',
        category: 'Performance',
        impact: 'Stable pages prevent older adults from clicking wrong elements.',
    }
};

const LITE_CATEGORY_COLORS = {
    'Vision': { bg: '#E3F2FD', border: '#1976D2' },
    'Motor': { bg: '#F3E5F5', border: '#7B1FA2' },
    'Cognitive': { bg: '#E8F5E8', border: '#388E3C' },
    'Performance': { bg: '#FFF3E0', border: '#F57C00' },
    'Security': { bg: '#FFEBEE', border: '#D32F2F' },
    'Technical': { bg: '#F5F5F5', border: '#616161' }
};

// Premium features that are missing in lite version
const PREMIUM_FEATURES = {
    additionalAudits: [
        'Text Size and Readability Analysis - In-depth font analysis',
        'Interactive Elements Visual Clarity - Color-only navigation detection',
        'Text Spacing Flexibility - Layout brittleness testing',
        'Page Responsiveness - JavaScript blocking analysis',
        'Privacy-Respecting Location Requests - Geolocation audit',
        'Page Complexity Management - DOM size optimization',
        'Technical Stability - Console error detection'
    ],
    visualFeatures: [
        'Visual highlighting of problem areas on your website',
        'Before/after comparison screenshots',
        'Color contrast heatmaps',
        'Interactive element visualization',
        'Font size analysis overlays'
    ],
    detailedAnalysis: [
        'Comprehensive explanations of why each issue matters for older adults',
        'Specific code recommendations and fixes',
        'Detailed impact assessments for each accessibility barrier',
        'Step-by-step improvement guides',
        'Technical implementation details'
    ],
    reportingFeatures: [
        'Multi-page detailed findings with data tables',
        'Score calculation breakdown and methodology',
        'Category-based organization with color coding',
        'Professional client-ready formatting',
        'Downloadable client folders organized by website and device type'
    ],
    categories: {
        'Vision Accessibility': 'Complete analysis of all visual barriers affecting older adults',
        'Motor Accessibility': 'Comprehensive motor skill and dexterity assessments',
        'Cognitive Accessibility': 'Full cognitive load and usability evaluation',
        'Performance for Older Adults': 'Detailed speed and responsiveness optimization',
        'Security for Older Adults': 'Complete privacy and security audit',
        'Technical Accessibility': 'Full technical compliance and stability check'
    }
};

// Function to calculate the lite score
function calculateLiteScore(report) {
    const scorecard = buildAuditScorecard(report, { isLiteVersion: true });
    return { finalScore: scorecard.overallScore };
}

class LiteAccessibilityPDFGenerator {
    constructor() {
        this.doc = new PDFDocument({
            margin: 40,
            size: 'A4'
        });

        this.doc.registerFont('RegularFont', 'Helvetica');
        this.doc.registerFont('BoldFont', 'Helvetica-Bold');

        this.currentY = 40;
        this.pageWidth = 515;
        this.margin = 40;
    }

    addPage() {
        this.doc.addPage();
        this.currentY = this.margin;
    }

    addTitle(text, fontSize = 28) {
        this.doc.fontSize(fontSize).font('BoldFont').fillColor('#2C3E50')
            .text(text, this.margin, this.currentY, { width: this.pageWidth, align: 'center' });
        this.currentY += fontSize + 25;
    }

    addHeading(text, fontSize = 16, color = '#34495E') {
        this.doc.fontSize(fontSize).font('BoldFont').fillColor(color)
            .text(text, this.margin, this.currentY, { width: this.pageWidth });
        this.currentY += fontSize + 12;
    }

    addBodyText(text, fontSize = 14, color = '#2C3E50') {
        this.doc.fontSize(fontSize).font('RegularFont').fillColor(color)
            .text(text, this.margin, this.currentY, { width: this.pageWidth, align: 'justify', lineGap: 3 });
        this.currentY += this.doc.heightOfString(text, { width: this.pageWidth, lineGap: 3 }) + 12;
    }

    addScoreDisplay(scoreData) {
    const score = scoreData.finalScore;
    const roundedScore = Math.round(score); // Round the score first
    const centerX = this.doc.page.width / 2;
    const radius = 50;

    // Three-tier color system: Pass (>=80%), Needs Improvement (70-79%), Fail (<70%)
    let scoreColor;
    if (roundedScore >= 80) {
        scoreColor = '#28A745'; // Green for Pass
    } else if (roundedScore >= 70) {
        scoreColor = '#FD7E14'; // Yellow/Orange for Needs Improvement
    } else {
        scoreColor = '#DC3545'; // Red for Fail
    }

    this.doc.circle(centerX, this.currentY + radius, radius).fill(scoreColor);
    this.doc.fontSize(40).font('BoldFont').fillColor('#FFFFFF')
        .text(roundedScore, centerX - (radius / 2), this.currentY + (radius / 2) + 5,
            { width: radius, align: 'center' });
    this.currentY += (radius * 2) + 15;
    this.doc.fontSize(14).font('BoldFont').fillColor('#2C3E50')
        .text('SilverSurfers Score (Lite)', this.margin, this.currentY,
            { width: this.pageWidth, align: 'center' });
    this.currentY += 30;
}

    addLiteResults(reportData) {
        const audits = reportData.audits || {};

        // Add page break for results
        this.addPage();
        
        // Results heading
        this.doc.fontSize(18).font('BoldFont').fillColor('#1F2937')
            .text('Accessibility Check Results', this.margin, this.currentY);
        
        // Divider line
        this.doc.moveTo(this.margin, this.currentY + 25)
            .lineTo(this.margin + this.pageWidth, this.currentY + 25)
            .lineWidth(2).stroke('#3B82F6');
        
        this.currentY += 45;
        
        // Info box
        const infoBoxHeight = 80;
        this.doc.rect(this.margin, this.currentY, this.pageWidth, infoBoxHeight).fill('#EFF6FF').stroke('#3B82F6');
        this.doc.fontSize(12).font('RegularFont').fillColor('#1E40AF')
            .text('The Quick Scan report is a limited view of the website submitted and only audits the home page.', 
                this.margin + 15, this.currentY + 18, { width: this.pageWidth - 30, align: 'left', lineGap: 3 });
        
        this.currentY += infoBoxHeight + 25;

        // Results in 2-column card grid
        const cardWidth = (this.pageWidth - 15) / 2;
        const cardSpacing = 15;
        const badgeWidth = 90;
        const badgeHeight = 22;
        const titleLeftPad = 12;
        const titleRightGap = 10; // gap between title text and badge
        const titleWidth = cardWidth - badgeWidth - titleLeftPad - titleRightGap;

        // Pre-compute each card's required height so paired cards in the same row share the same height
        const cardItems = Object.keys(LITE_AUDIT_INFO)
            .map((auditId) => {
                const auditResult = audits[auditId];
                const auditInfo = LITE_AUDIT_INFO[auditId];
                if (!auditResult || !auditInfo || auditResult.score === null) return null;
                return { auditId, auditResult, auditInfo };
            })
            .filter(Boolean);

        // Calculate each card's height before drawing so paired rows share max height
        const cardHeights = cardItems.map(({ auditInfo }) => {
            this.doc.fontSize(14).font('BoldFont');
            const titleH = this.doc.heightOfString(auditInfo.title, { width: titleWidth });
            this.doc.fontSize(11).font('RegularFont');
            const descH = this.doc.heightOfString(auditInfo.impact, { width: cardWidth - 24, lineGap: 3 });
            const neededH = 12 + titleH + 8 + Math.min(descH, 44) + 12; // top + title + gap + desc (capped) + bottom
            return Math.max(neededH, 100);
        });

        let column = 0;
        let rowStartY = this.currentY;

        cardItems.forEach(({ auditResult, auditInfo }, index) => {
            const score = auditResult.score;
            const status = score >= 0.8 ? 'PASS' : score >= 0.7 ? 'NEEDS IMP.' : 'FAIL';

            let bgColor, borderColor, badgeBg;
            if (score >= 0.8) {
                bgColor = '#ECFDF5'; borderColor = '#10B981'; badgeBg = '#10B981';
            } else if (score >= 0.7) {
                bgColor = '#FEF3C7'; borderColor = '#F59E0B'; badgeBg = '#F59E0B';
            } else {
                bgColor = '#FEE2E2'; borderColor = '#EF4444'; badgeBg = '#EF4444';
            }

            // Row height = max of this card and its partner (if it exists)
            const partnerIndex = column === 0 ? index + 1 : index - 1;
            const rowHeight = Math.max(
                cardHeights[index],
                partnerIndex < cardHeights.length ? cardHeights[partnerIndex] : 0
            );

            if (column === 0 && rowStartY + rowHeight > this.doc.page.height - 50) {
                this.addPage();
                rowStartY = this.currentY;
            }

            const cardX = this.margin + (column * (cardWidth + cardSpacing));
            const cardY = rowStartY;

            // Card background and left accent border
            this.doc.rect(cardX, cardY, cardWidth, rowHeight).fill(bgColor);
            this.doc.rect(cardX, cardY, 4, rowHeight).fill(borderColor);

            // Status badge — top right, clear of title area
            const badgeX = cardX + cardWidth - badgeWidth - 8;
            const badgeY = cardY + 8;
            this.doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 10).fill(badgeBg);
            this.doc.fontSize(8).font('BoldFont').fillColor('#FFFFFF')
                .text(status, badgeX, badgeY + 6, { width: badgeWidth, align: 'center', lineBreak: false });

            // Title — constrained to left zone, never reaching badge column
            this.doc.fontSize(14).font('BoldFont').fillColor('#1F2937');
            const titleH = this.doc.heightOfString(auditInfo.title, { width: titleWidth });
            this.doc.text(auditInfo.title, cardX + titleLeftPad, cardY + 12, { width: titleWidth });

            // Description — positioned below actual title height
            const descY = cardY + 12 + titleH + 8;
            const descMaxH = rowHeight - (descY - cardY) - 10;
            if (descMaxH > 10) {
                this.doc.fontSize(11).font('RegularFont').fillColor('#6B7280')
                    .text(auditInfo.impact, cardX + titleLeftPad, descY, {
                        width: cardWidth - 24,
                        height: descMaxH,
                        ellipsis: true,
                        lineGap: 3,
                    });
            }

            column++;
            if (column >= 2) {
                column = 0;
                rowStartY += rowHeight + cardSpacing;
            }
        });

        // Update currentY to after the last row
        const lastRowHeight = cardItems.length > 0 ? Math.max(
            cardHeights[cardHeights.length - 1],
            cardHeights.length >= 2 ? cardHeights[cardHeights.length - 2] : 0
        ) : 0;
        this.currentY = rowStartY + (column > 0 ? lastRowHeight + cardSpacing : 0);
    }

    addPremiumComparisonPage() {
        this.addPage();

        // Header with gradient-like effect - matching website colors
        this.doc.rect(0, 0, this.doc.page.width, 100).fill('#1E40AF');
        this.doc.fontSize(20).font('BoldFont').fillColor('white')
            .text('Upgrade SilverSurfers Subscription', this.margin, 30, { width: this.pageWidth, align: 'center' });
        
        this.doc.fontSize(16).font('RegularFont').fillColor('#BFDBFE')
            .text('Unlock the complete older adult accessibility analysis', this.margin, 60, { width: this.pageWidth, align: 'center' });

        this.currentY = 130;

        // Premium features section - Boxes with blue background
        const fullBoxWidth = this.pageWidth;
        const boxHeight = 280;
        
        // Box 1: Additional Critical Audits (full width)
        this.doc.roundedRect(this.margin, this.currentY, fullBoxWidth, boxHeight, 10).fill('#1E3A8A');
        this.doc.fontSize(16).font('BoldFont').fillColor('#FFFFFF')
            .text('Receive additional critical Audits', this.margin + 15, this.currentY + 15, { width: fullBoxWidth - 30 });
        
        let yPos = this.currentY + 40;
        const bulletX = this.margin + 15;
        const textX = bulletX + 12;
        const textWidth = fullBoxWidth - 45;
        PREMIUM_FEATURES.additionalAudits.forEach(audit => {
            this.doc.fontSize(13).font('RegularFont').fillColor('#BFDBFE')
                .text('•', bulletX, yPos, { width: 14 });
            const textHeight = this.doc.heightOfString(audit, { width: textWidth - 10, lineGap: 3 });
            this.doc.text(audit, textX, yPos, { width: textWidth - 10, lineGap: 3 });
            yPos += textHeight + 10;
        });

        this.currentY += boxHeight + 20;
        
        // Box 2: Comprehensive Analysis (full width, matching)
        const box3Height = 190;
        this.doc.roundedRect(this.margin, this.currentY, fullBoxWidth, box3Height, 10).fill('#1E3A8A');
        this.doc.fontSize(16).font('BoldFont').fillColor('#FFFFFF')
            .text('Comprehensive Analysis', this.margin + 15, this.currentY + 15, { width: fullBoxWidth - 30 });
        
        yPos = this.currentY + 40;
        PREMIUM_FEATURES.detailedAnalysis.forEach(feature => {
            this.doc.fontSize(13).font('RegularFont').fillColor('#BFDBFE')
                .text('• ' + feature, this.margin + 15, yPos, { width: fullBoxWidth - 30, lineGap: 3 });
            const featureHeight = this.doc.heightOfString(feature, { width: fullBoxWidth - 45, lineGap: 3 });
            yPos += featureHeight + 10;
        });
        
        this.currentY += box3Height + 15;
        
        // Upgrade button
        const buttonWidth = 200;
        const buttonX = (this.doc.page.width - buttonWidth) / 2;
        this.doc.roundedRect(buttonX, this.currentY, buttonWidth, 40, 20).fill('#FFFFFF');
        this.doc.fontSize(14).font('BoldFont').fillColor('#1E40AF')
            .text('Upgrade Now', buttonX, this.currentY + 12, { width: buttonWidth, align: 'center' });
        
        this.currentY += 60;
        
        // Bottom explanatory text - properly wrapped
        this.doc.fontSize(12).font('RegularFont').fillColor('#6B7280')
            .text('This Quick Scan report provides a basic overview of the homepage highlighting essential older adult accessibility checks. Subscription packages includes comprehensive analysis, detailed recommendations, and professional reporting features to help you create a truly older adult-friendly digital experience.', 
                this.margin + 20, this.currentY, { width: this.pageWidth - 40, align: 'left', lineGap: 3 });
    }

    addPremiumFeaturesPage() {
        this.addPage();

        this.addHeading('Premium Report Features:', 16, '#2980B9');
        this.currentY += 10;

        // Professional Reporting
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 30).fill('#FFF3E0').stroke('#F57C00');
        this.doc.fontSize(14).font('BoldFont').fillColor('#E65100')
            .text('Professional Client-Ready Reports', this.margin + 10, this.currentY + 8);
        this.currentY += 40;

        PREMIUM_FEATURES.reportingFeatures.forEach(feature => {
            this.doc.fontSize(14).font('RegularFont').fillColor('#2C3E50')
                .text(`• ${feature}`, this.margin + 10, this.currentY, { lineGap: 3 });
            const featureHeight = this.doc.heightOfString(`• ${feature}`, { width: this.pageWidth - 20, lineGap: 3 });
            this.currentY += featureHeight + 10;
        });

        this.currentY += 20;

        // Categories comparison
        this.addHeading('Complete Category Coverage in Premium:', 16, '#8E44AD');
        this.currentY += 10;

        Object.entries(PREMIUM_FEATURES.categories).forEach(([category, description]) => {
            this.doc.fontSize(16).font('BoldFont').fillColor('#2C3E50')
                .text(category, this.margin, this.currentY);
            this.currentY += 18;
            this.doc.fontSize(14).font('RegularFont').fillColor('#666')
                .text(description, this.margin + 10, this.currentY, { lineGap: 3 });
            const descHeight = this.doc.heightOfString(description, { width: this.pageWidth - 20, lineGap: 3 });
            this.currentY += descHeight + 10;
        });

        // Call to action
        this.currentY += 20;

        // Ensure the CTA and summary fit on the page when using larger fonts
        if (this.currentY + 180 > this.doc.page.height - this.margin) {
            this.addPage();
        }

        this.doc.rect(this.margin, this.currentY, this.pageWidth, 60).fill('#27AE60').stroke('#1E8449');
        this.doc.fontSize(16).font('BoldFont').fillColor('white')
            .text('Upgrade to Premium Today!', this.margin + 10, this.currentY + 10);
        this.doc.fontSize(14).font('RegularFont').fillColor('#D5F4E6')
            .text('Get the complete older adult accessibility analysis your website deserves.', this.margin + 10, this.currentY + 35);
        this.currentY += 80;

        // Comparison summary
        this.addBodyText('Quick Scan: Basic overview of 11 essential checks', 14, '#95A5A6');
        this.addBodyText('Premium Version: Comprehensive analysis of 18+ audits with visual highlighting, detailed recommendations, and professional reporting', 14, '#27AE60');
    }

    addLiteWcagSection(reportData) {
        const wcagMatrix = Array.isArray(reportData.wcagMatrix) ? reportData.wcagMatrix : [];
        if (!wcagMatrix.length) return;

        this.addPage();

        const standardLabel = describeWcagStandardLabel(reportData.wcagStandard, reportData.conformanceLevel);
        this.doc.fontSize(18).font('BoldFont').fillColor('#1F2937')
            .text(`${standardLabel} Coverage Overview`, this.margin, this.currentY);
        this.doc.moveTo(this.margin, this.currentY + 24)
            .lineTo(this.margin + this.pageWidth, this.currentY + 24)
            .lineWidth(2).stroke('#3B82F6');
        this.currentY += 44;

        // 4-card summary banner
        const passed = wcagMatrix.filter(r => r.status === 'pass').length;
        const failed = wcagMatrix.filter(r => r.status === 'fail').length;
        const needsReview = wcagMatrix.filter(r => r.status === 'needs-review').length;
        const notApplicable = wcagMatrix.filter(r => r.status === 'not-applicable').length;

        const summaryCards = [
            { label: 'Passed', value: String(passed), color: '#10B981' },
            { label: 'Failed', value: String(failed), color: '#DC3545' },
            { label: 'Needs Review', value: String(needsReview), color: '#F59E0B' },
            { label: 'Not Applicable', value: String(notApplicable), color: '#6B7280' },
        ];

        const cardWidth = (this.pageWidth - 18) / 4;
        summaryCards.forEach((card, index) => {
            const x = this.margin + index * (cardWidth + 6);
            this.doc.roundedRect(x, this.currentY, cardWidth, 54, 6).fill('#F8FAFC').stroke('#E5E7EB');
            this.doc.fontSize(20).font('BoldFont').fillColor(card.color)
                .text(card.value, x + 8, this.currentY + 9, { width: cardWidth - 16, align: 'center' });
            this.doc.fontSize(7).font('BoldFont').fillColor('#6B7280')
                .text(card.label.toUpperCase(), x + 6, this.currentY + 36, { width: cardWidth - 12, align: 'center' });
        });
        this.currentY += 70;

        // Top 5 failed criteria
        const topFailed = wcagMatrix
            .filter(r => r.status === 'fail')
            .slice(0, 5);

        if (topFailed.length) {
            this.doc.fontSize(13).font('BoldFont').fillColor('#1F2937')
                .text('Top Failed Criteria', this.margin, this.currentY);
            this.currentY += 20;

            const colWidths = [50, 175, 290];
            const headers = ['Criterion', 'Title', 'Action Required'];

            // Table header
            this.doc.rect(this.margin, this.currentY, this.pageWidth, 28).fill('#3D5A80');
            this.doc.font('BoldFont').fontSize(9).fillColor('#FFFFFF');
            let x = this.margin;
            headers.forEach((header, i) => {
                this.doc.text(header, x + 5, this.currentY + 9, {
                    width: colWidths[i] - 10,
                    align: i === 0 ? 'center' : 'left',
                });
                x += colWidths[i];
            });
            this.currentY += 28;

            topFailed.forEach((row, rowIndex) => {
                const actionText = row.remediationGuidance || '';
                this.doc.fontSize(9).font('RegularFont');
                const cellTexts = [row.criterion || '', row.title || '', actionText];
                const rowHeights = cellTexts.map((text, i) =>
                    this.doc.heightOfString(text, { width: colWidths[i] - 10, lineGap: 1.5 })
                );
                const rowHeight = Math.max(26, Math.max(...rowHeights) + 12);

                if (this.currentY + rowHeight > this.doc.page.height - 50) {
                    this.addPage();
                }

                this.doc.rect(this.margin, this.currentY, this.pageWidth, rowHeight)
                    .fill(rowIndex % 2 === 0 ? '#FFFFFF' : '#F8F9FA');

                x = this.margin;
                cellTexts.forEach((text, i) => {
                    this.doc.font('RegularFont').fontSize(9).fillColor('#2C3E50')
                        .text(text, x + 5, this.currentY + 6, {
                            width: colWidths[i] - 10,
                            lineGap: 1.5,
                            align: i === 0 ? 'center' : 'left',
                        });
                    x += colWidths[i];
                });

                this.doc.moveTo(this.margin, this.currentY + rowHeight)
                    .lineTo(this.margin + this.pageWidth, this.currentY + rowHeight)
                    .strokeColor('#DEE2E6').lineWidth(0.5).stroke();

                this.currentY += rowHeight;
            });

            this.currentY += 10;
        }

        // Disclaimer
        const disclaimer = 'Criteria marked Needs Review cannot be fully assessed by automated scanning. They require manual review by a qualified accessibility specialist. This report does not constitute a legal conformance certification.';
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 1).fill('#DEE2E6');
        this.currentY += 8;
        this.doc.fontSize(8).font('RegularFont').fillColor('#6B7280')
            .text(disclaimer, this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 });
        this.currentY += this.doc.heightOfString(disclaimer, { width: this.pageWidth, lineGap: 2 }) + 12;
    }

    async generateLiteReport(inputFile, outputFile, options = {}) { // <-- REMOVED THE DEFAULT VALUE
        try {
            const reportData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
            // 2.2.7.3 — carry the evaluated standard/level in, since this
            // reads reportData fresh from disk rather than an options merge.
            if (options.wcagStandard) reportData.wcagStandard = options.wcagStandard;
            if (options.conformanceLevel) reportData.conformanceLevel = options.conformanceLevel;
            const scoreData = calculateLiteScore(reportData);

            const stream = fs.createWriteStream(outputFile);
            this.doc.pipe(stream);

            // Header - align with deep blue used in premium sections
            this.doc.rect(0, 0, this.doc.page.width, 120).fill('#1E3A8A');
            
            // Title
            this.doc.fontSize(28).font('BoldFont').fillColor('white')
                .text('SilverSurfers Quick Scan Report', this.margin, 40, { width: this.pageWidth, align: 'center' });
            
            // Subtitle
            this.doc.fontSize(14).font('RegularFont').fillColor('#E3F2FD')
                .text('QUICK SCAN VERSION - ESSENTIAL CHECKS', this.margin, 80, { width: this.pageWidth, align: 'center' });

            this.currentY = 140;

            // Score section with blue background
            const scoreBoxHeight = 200;
            this.doc.rect(0, this.currentY, this.doc.page.width, scoreBoxHeight).fill('#1E3A8A');
            
            // Draw score circle with color-coded background
            const centerX = this.doc.page.width / 2;
            const circleY = this.currentY + 80;
            const roundedScore = Math.round(scoreData.finalScore);
            
            // Three-tier color system: Pass (>=80%), Needs Improvement (70-79%), Fail (<70%)
            let scoreColor;
            if (roundedScore >= 80) {
                scoreColor = '#28A745'; // Green for Pass
            } else if (roundedScore >= 70) {
                scoreColor = '#FD7E14'; // Yellow/Orange for Needs Improvement
            } else {
                scoreColor = '#DC3545'; // Red for Fail
            }
            
            // Draw colored circle
            this.doc.circle(centerX, circleY, 60).fill(scoreColor);
            
            // Score text
            this.doc.fontSize(48).font('BoldFont').fillColor('#FFFFFF').opacity(1)
                .text(`${roundedScore}%`, 0, circleY - 24, { width: this.doc.page.width, align: 'center' });
            
            // Score label
            this.doc.fontSize(14).font('RegularFont').fillColor('#FFFFFF')
                .text('SilverSurfers Score', 0, circleY + 80, { width: this.doc.page.width, align: 'center' });
            
            // Status text below score circle
            let statusText;
            if (roundedScore >= 80) {
                statusText = 'Pass - Highly accessible for older adults';
            } else if (roundedScore >= 70) {
                statusText = 'Needs Improvement - Falls below recommended standards';
            } else {
                statusText = 'Fail - Significant barriers to older adults';
            }
            
            this.doc.fontSize(12).font('BoldFont').fillColor('#FFFFFF')
                .text(statusText, 0, circleY + 105, { width: this.doc.page.width, align: 'center' });
            
            this.currentY += scoreBoxHeight + 20;

            // Website info box
            if (reportData.finalUrl) {
                this.doc.rect(this.margin, this.currentY, this.pageWidth, 70).fill('#F5F5F5');
                this.doc.fontSize(16).font('BoldFont').fillColor('#333333')
                    .text('Website Analyzed:', this.margin + 15, this.currentY + 16);
                this.doc.fontSize(14).font('RegularFont').fillColor('#3B82F6')
                    .text(reportData.finalUrl, this.margin + 15, this.currentY + 40);
                this.currentY += 90;
            }

            // 2.2.7.3 — evaluated WCAG standard/level, prominent in the report header
            this.doc.fontSize(11).font('RegularFont').fillColor('#333333')
                .text(`Evaluated against: ${describeWcagStandardLabel(reportData.wcagStandard, reportData.conformanceLevel)}`, this.margin, this.currentY);
            this.currentY += 20;

            // Results
            this.addLiteResults(reportData);

            // WCAG matrix overview
            this.addLiteWcagSection(reportData);

            // Add premium comparison page
            this.addPremiumComparisonPage();

            this.doc.end();

            return new Promise((resolve, reject) => {
                stream.on('finish', () => {
                    console.log(`Enhanced lite accessibility report generated: ${outputFile}`);
                    resolve({
                        success: true,
                        reportPath: outputFile,
                        score: scoreData.finalScore.toFixed(0),
                        isLiteVersion: true,
                        premiumFeaturesHighlighted: true
                    });
                });
                stream.on('error', reject);
            });

        } catch (error) {
            console.error('Error generating enhanced lite report:', error.message);
            throw error;
        }
    }
}

export async function generateLiteAccessibilityReport(inputFile, outputDirectory, options = {}) {
    if (!inputFile || !outputDirectory) {
        throw new Error('Both inputFile and outputDirectory are required.');
    }

    // 1. Read the JSON file to get the URL for the filename
    const reportData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    if (!reportData.finalUrl) {
        throw new Error('The report JSON must contain a finalUrl property.');
    }

    // 2. Create the sanitized report name from the URL (e.g., "www-example-com.pdf")
    const urlObject = new URL(reportData.finalUrl);
    const reportName = `${urlObject.hostname.replace(/\./g, '-')}.pdf`;

    // 3. Combine the provided directory and the new filename
    const outputPath = path.join(outputDirectory, reportName);

    // 4. Ensure the target directory exists before writing the file
    // The calling script is now responsible for the folder's name and location.
    fs.mkdirSync(outputDirectory, { recursive: true });

    // 5. Generate the report
    const generator = new LiteAccessibilityPDFGenerator();
    return await generator.generateLiteReport(inputFile, outputPath, options);
}
