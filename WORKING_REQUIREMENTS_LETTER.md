# SilverSurfers Working Requirements Letter

Last updated: 2026-03-28

## Purpose

This document consolidates the provided PRDs, research PDFs, legal notes, and platform documentation into one working requirements reference for planning, estimation, and scope alignment.

Use this file together with:

- `PROJECT_SCOPE_STATUS.md`
- `DEVELOPER_TASK_CHECKLIST.md`
- `backend/README.md`
- `frontend-next/README.md`

## Source Documents Reviewed

### Product, framework, and architecture

- `SilverSurfers_ai_Product Requirements Document_v6_REVIEWED CLD w MNS.pdf`
- `SilverSurfers_ai_Product Requirements Document_v6_REVIEWED CLD w MNS (1).pdf`
- `The_Eight_Dimensions_v6_UPDATED.pdf`
- `State_of_the_Silver_Web_2026_UPDATED.pdf`
- `SilverSurfers - audit-algorithms.pdf`
- `SilverSurfers - TECHNICAL_DOCUMENTATION.pdf`
- `SilverSurfers - USER_DOCUMENTATION.pdf`

### Accessibility guidance and user research

- `Digital Accessibility Guide for Older Adults.pdf`
- `Silver Surfer - Older_Adult_Friendly_Checklist.pdf`
- `digital_accessibility_survey_for_seniors.pdf`
- `Survey Results - 09-2025.pdf`
- `Smart-Use-of-AI-for-Consumers-50-and-Older-Staying-Safe-and-Making-Life-Easier (1).pdf`

### Legal, market, and business case inputs

- `Accessibility_Overlay_Lawsuit_Report Jan26.pdf`
- `The Overlay Issues - AccessiBe Case.pdf`
- `SilverSurfers Research - The High Payoff v3.pdf`

## Working Interpretation Rules

- The current repository is the source of truth for what is already implemented.
- The PRD is the strategic product vision. It includes future-phase items that are not yet present in the codebase.
- Research whitepapers and guidance documents should shape priorities and UX rules, but they should not automatically be treated as already-contracted deliverables.
- When documents conflict, use this decision order:
  1. explicitly agreed milestone scope
  2. current repository reality
  3. PRD strategic roadmap
  4. supporting research and marketing documents

## Consolidated Product Definition

SilverSurfers is a senior-focused digital accessibility and usability intelligence platform for adults aged 50 and over. The platform combines automated scanning, WCAG-aligned issue detection, older-adult heuristics, weighted scoring, remediation guidance, and report delivery to help organizations improve accessibility, usability, trust, and litigation readiness.

## Core Product Principles Derived from the Research

- Accessibility for older adults must go beyond baseline WCAG compliance.
- The product should optimize for readability, simplicity, trust, and reduced friction.
- Body text should favor senior-friendly sizing, with 16px as the practical minimum baseline.
- Color contrast, spacing, and visual hierarchy should exceed bare-minimum compliance where possible.
- Forms, buttons, and interactive controls should be forgiving for reduced motor precision.
- Navigation should reduce disorientation, clutter, and decision overload.
- Plain language is a requirement, not a cosmetic improvement.
- Mobile usability matters because older adults heavily use smartphones.
- Pop-ups, aggressive ads, autoplay media, and visual clutter should be treated as accessibility and usability risks.
- Manual remediation and defensible audit practices are preferred over overlay-style quick fixes.

## Silver Score v1: Working Definition

The source documents contain both an 8-dimension model and a 4-dimension weighted model. The best consolidated interpretation is:

- SilverSurfers evaluates websites across 8 dimensions of Silver Web Excellence.
- The findings from those 8 dimensions are aggregated into 4 weighted scoring categories for the Silver Score v1.

### 8 evaluation dimensions

1. Technical Accessibility
2. Visual Clarity and Design
3. Cognitive Load and Complexity
4. Navigation and Information Architecture
5. Content Readability and Plain Language
6. Interaction and Forms
7. Trust and Security Signals
8. Mobile and Cross-Platform Optimization

### 4 weighted scoring categories

1. Visual Clarity - 30%
2. Cognitive Load - 25%
3. Motor Accessibility - 25%
4. Content and Trust - 20%

This interpretation should be treated as the working requirement unless a later signed scope explicitly replaces it.

## Recommended M1 Technical Baseline

For implementation and contract clarity, Milestone 1 should be defined around the following technical stack:

- `axe-core` for automated accessibility rule detection
- Google Lighthouse for accessibility, performance, and supporting audit signals
- custom senior-oriented audits and heuristics for older-adult usability gaps
- PDF and dashboard reporting built on SilverSurfers-owned presentation and scoring logic

### Important note on Deque tooling

- `axe-core` is sufficient for Milestone 1.
- Paid `axe DevTools API` should be treated as optional enterprise workflow tooling, not a hard M1 dependency, unless a client contract specifically requires it.

## Working Delivery Scope

### M1 Committed Requirements

#### 1. Core audit engine

- Accept a website URL for audit submission.
- Run automated scanning without manual operator intervention.
- Support desktop, tablet, and mobile execution modes.
- Use Lighthouse, `axe-core`, and custom senior-focused heuristics as the main detection stack.
- Support at least single-URL auditing and basic multi-page internal-link coverage.
- Record findings in a structured format for scoring, reporting, and dashboard use.

#### 2. Silver Score system

- Generate a 0-100 Silver Score.
- Evaluate findings across the 8 Silver Web dimensions.
- Aggregate results into the 4 weighted Silver Score categories.
- Return a score breakdown that shows why the score was earned.
- Preserve issue grouping by dimension so reports remain explainable.

#### 3. WCAG and aging-intelligence layer

- Map detectable issues to WCAG 2.1 and 2.2 AA expectations where applicable.
- Apply older-adult heuristics on top of WCAG-style findings.
- Include age-focused checks such as font size, readability, touch target size, clutter, layout stability, and plain-language concerns.
- Avoid claiming that automated scanning alone produces full legal compliance.

#### 4. Risk and prioritization outputs

- Assign High, Medium, or Low risk tiers.
- Generate a remediation roadmap that explains what to fix and why it matters.
- Include effort and impact style guidance, even if the first version is simplified.
- Provide code or implementation snippets where helpful.

#### 5. Reporting

- Generate a branded PDF report.
- Include overall Silver Score summary.
- Include dimension-by-dimension breakdown.
- Include issue details, recommendations, and WCAG references.
- Present recommendations in a business-friendly format, not only a technical dump.
- Make reports readable and professional, even if not yet enterprise-consulting grade.

#### 6. Dashboard and delivery

- Provide a scan submission flow.
- Show scan history to authenticated users.
- Support report download.
- Support email-based report delivery.
- Provide a basic admin view for operational monitoring and content management.

### M1 Conditional Items That Need Explicit Approval

These items appear in one or more source documents, but should be treated as additional scope unless explicitly confirmed in a signed work order:

- OpenAI-powered explanations and remediation generation
- fully automated AI prioritization and reasoning
- 500-page crawl support
- enterprise-grade business impact modeling
- named prioritization buckets such as Quick Wins, Medium Effort, and High Effort
- executive trend dashboards and monitoring intelligence
- certification issuance and public registry
- accessibility statement generator
- healthcare-specific scoring and workflows
- SSO or SAML integrations
- SOC 2 and HIPAA implementation work

## Recommended Scope Boundary for the Working Letter

To keep Milestone 1 credible and deliverable, the working letter should frame the project as:

- a functional senior-focused audit and reporting platform
- with weighted scoring, WCAG-aligned findings, older-adult heuristics, PDF reporting, and dashboard delivery
- built on `axe-core`, Lighthouse, and custom SilverSurfers logic
- without promising enterprise-scale automation, certification, or regulated-industry modules in the initial milestone unless separately approved

## M2 and Later-Phase Roadmap

### M2 Continuous Monitoring and dashboards

- scheduled daily, weekly, and monthly scanning
- regression detection
- email and in-app alerts
- trend dashboards
- role-gated executive and operator views

### M3 Vertical modules

- healthcare-specific scoring
- appointment-booking friction analysis
- patient-portal analysis
- insurance readability analysis
- top-300 healthcare benchmarking workflows

### M4 and M6 Certification and advisory

- certification eligibility rules
- badge issuance and validation
- public registry
- accessibility statement generation
- litigation defense packs
- audit-trail and remediation evidence exports

### Enterprise API and infrastructure

- partner and customer API layer
- webhook support
- SSO and SAML
- Okta and Azure AD integrations
- white-label reporting or dashboards
- security and compliance controls for SOC 2 and healthcare-oriented handling

## Legal and Positioning Requirements

The overlay-related legal documents strongly support the following product and messaging requirements:

- SilverSurfers should not position itself as an overlay or instant compliance widget.
- The platform should avoid promises that a scan alone makes a site fully compliant.
- The platform should emphasize audits, defensible reporting, and remediation guidance.
- Overlay replacement or overlay-risk education may be a useful sales and advisory angle.
- Legal-risk framing should remain evidence-based and avoid exaggerated compliance claims.

## Current Repository Alignment Summary

This section is intentionally high level. Detailed code-level status is already documented in `PROJECT_SCOPE_STATUS.md`.

### Already aligned with the working requirements

- URL-based scanning exists
- queued processing exists
- desktop, tablet, and mobile audit execution exists
- Lighthouse-based auditing exists
- custom senior-oriented audits exist
- weighted scoring exists
- risk tiering exists
- remediation roadmap generation exists
- PDF reporting exists
- user dashboard flows exist
- admin flows exist
- report download and email delivery exist

### Partially aligned

- multi-page crawling exists, but at limited depth and page count
- WCAG mapping exists indirectly, but not yet as a clearly formalized engine
- score explainability exists, but the 8-to-4 model needs to be documented consistently across product and code
- prioritization exists in basic form, but not yet as a polished strategic engine

### Not yet aligned

- OpenAI integration
- 500-page crawling
- certification workflows
- healthcare module
- accessibility statement generation
- enterprise SSO or SAML
- SOC 2 and HIPAA implementation foundations

## Open Decisions to Resolve Before Final Estimation

- Is OpenAI part of the committed Milestone 1 scope, or an optional add-on?
- Is 500-page crawling required in Milestone 1, or later?
- Is the 4-category Silver Score model accepted as the reporting layer for the 8-dimension framework?
- Does the client require paid `axe DevTools API`, or is `axe-core` approved?
- Are certification, healthcare, and enterprise security features active delivery scope or roadmap-only items?

## Recommended Acceptance Criteria for the Working Letter

The work letter should be considered internally aligned when the team agrees that:

- M1 is centered on a stable audit, scoring, report, and dashboard product
- the Silver Score is defined as 8 evaluation dimensions aggregated into 4 weighted score categories
- `axe-core + Lighthouse + custom heuristics` is the approved M1 audit stack
- later-phase items are clearly separated from the committed initial delivery
- no part of the wording implies overlay-style instant compliance promises

## Recommended Work-Letter Wording

The following wording is suitable as a starting point for a client or internal working letter:

> SilverSurfers Milestone 1 will deliver a senior-focused digital accessibility audit and reporting platform for adults aged 50 and over. The system will use `axe-core`, Google Lighthouse, and custom older-adult heuristics to evaluate websites across eight dimensions of Silver Web Excellence and aggregate the findings into four weighted Silver Score categories. Milestone 1 includes URL-based scan submission, multi-device analysis, WCAG-aligned issue mapping, risk-tier classification, remediation roadmap generation, branded PDF reporting, and a basic user dashboard for scan history and report delivery. Enterprise-scale features such as 500-page crawling, advanced AI reasoning, certification workflows, healthcare vertical tooling, SSO or SAML, and formal compliance programs will be treated as later-phase or separately approved scope unless explicitly added to the signed milestone definition.
