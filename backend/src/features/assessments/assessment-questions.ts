// The AI Readiness Assessment's 36-question intake instrument, transcribed
// verbatim from the source doc's Addendum (9-23-26 SilverSurfers_Milestone_3
// _Explore_Requirements.docx). This is the one piece of Milestone 3.1 that
// needed no open question answered before it could be built — see
// Docs/Milestone_3.1_Developer_Plan.md, Module 9.
//
// Decided (milestone_3_dev_team_answers.md #4): ask all 36, in this exact
// order, every time — no conditional skipping. assessment-agent.service.ts
// (Module 10) should walk this array by index; it is deliberately a flat
// list, not a decision tree.
//
// Versioned from day one (QUESTIONNAIRE_VERSION) because the client may
// revise question wording later — each Assessment record should store which
// version it was answered against so old and new reports stay comparable.

export const QUESTIONNAIRE_VERSION = 1;

export type AssessmentInputType =
  | 'text'       // single-line free text
  | 'textarea'   // multi-line free text
  | 'number'     // numeric input, optionally with a unit hint (see numberHint)
  | 'scale'      // 1-5 Likert-style rating
  | 'select'     // choose one
  | 'multiselect' // choose any number
  | 'ranking'    // rank a fixed list of items
  | 'matrix'     // repeating row/column grid (see matrixColumns)
  | 'contact';   // structured contact details (see contactFields)

export interface AssessmentQuestionOption {
  value: string;
  label: string;
}

export interface AssessmentMatrixColumn {
  key: string;
  label: string;
}

export interface AssessmentQuestion {
  id: number;
  section: string;
  prompt: string;
  inputType: AssessmentInputType;

  // select / multiselect / ranking: the exact choices. Left as an empty
  // array (with a note) where the source doc said "[Select one]" but did
  // not actually list the options — do not invent plausible-looking
  // choices here; get the real list from the client before Module 11
  // ships rather than guessing at launch-critical copy.
  options?: AssessmentQuestionOption[];

  // matrix only (questions 9 and 15):
  matrixColumns?: AssessmentMatrixColumn[];
  // #9's rows aren't fixed — they're whichever functions the customer
  // checked in question 8, so there's no static row list to store here.
  matrixRowsFromQuestionId?: number;
  // #15's rows are fixed regardless of earlier answers.
  matrixRows?: string[];

  numberHint?: string; // unit label for number inputs, e.g. '$ / hour'
  contactFields?: Array<'email' | 'phone'>; // question 36 only

  // Non-obvious context from the source doc worth surfacing to whoever
  // writes the chat agent's prompts or the report generator later.
  notes?: string;
}

export const ASSESSMENT_QUESTIONS: AssessmentQuestion[] = [
  // SECTION 1 — Business Profile
  { id: 1, section: 'Business Profile', prompt: 'Business name', inputType: 'text' },
  {
    id: 2,
    section: 'Business Profile',
    prompt: 'What does your business do? (industry / primary offering)',
    inputType: 'textarea',
  },
  {
    id: 3,
    section: 'Business Profile',
    prompt: 'Business type',
    inputType: 'select',
    options: [], // source doc says "[Select one]" but does not list the choices
    notes: 'Options not specified in the source requirements doc — confirm the actual list with the client before Module 11.',
  },
  {
    id: 4,
    section: 'Business Profile',
    prompt: 'How many people (including you) would use AI tools day-to-day?',
    inputType: 'number',
  },
  {
    id: 5,
    section: 'Business Profile',
    prompt: 'What is the single primary focus for this assessment?',
    inputType: 'select',
    options: [],
    notes: 'Options not specified in the source requirements doc — confirm the actual list with the client before Module 11.',
  },
  {
    id: 6,
    section: 'Business Profile',
    prompt: 'Who is completing this assessment, and what is their role?',
    inputType: 'text',
  },

  // SECTION 2 — The Pain: Where Time Is Going
  {
    id: 7,
    section: 'The Pain - Where Time Is Going',
    prompt:
      "Across your whole business, roughly how many hours per week go into repetitive, manual, or administrative tasks that don't require real judgment?",
    inputType: 'number',
  },
  {
    id: 8,
    section: 'The Pain - Where Time Is Going',
    prompt: 'Which of these business functions exist in your operation today?',
    inputType: 'multiselect',
    options: [
      { value: 'admin_scheduling_data_entry', label: 'Admin / scheduling / data entry' },
      { value: 'marketing_content', label: 'Marketing & content creation' },
      { value: 'sales_lead_followup', label: 'Sales & lead follow-up' },
      { value: 'customer_service', label: 'Customer service / support' },
      { value: 'bookkeeping_finance', label: 'Bookkeeping / finance / invoicing' },
      { value: 'hr_hiring_onboarding', label: 'HR / hiring / onboarding' },
      { value: 'operations_project_mgmt', label: 'Operations / project management' },
      { value: 'other', label: 'Other (please specify)' },
    ],
  },
  {
    id: 9,
    section: 'The Pain - Where Time Is Going',
    prompt:
      'For each function you checked above, estimate hours spent per week and how painful it feels (1 = mildly annoying, 5 = actively holding the business back).',
    inputType: 'matrix',
    matrixRowsFromQuestionId: 8,
    matrixColumns: [
      { key: 'hoursPerWeek', label: 'Hrs/week' },
      { key: 'pain', label: 'Pain (1-5)' },
      { key: 'handledBy', label: 'Currently handled by' },
    ],
  },
  {
    id: 10,
    section: 'The Pain - Where Time Is Going',
    prompt:
      'What are the 3 specific tasks that eat the most time each week? Be as concrete as possible (e.g., "manually copying leads from Facebook ads into our spreadsheet").',
    inputType: 'textarea',
  },
  {
    id: 11,
    section: 'The Pain - Where Time Is Going',
    prompt: 'If you could wave a wand and eliminate ONE task tomorrow, which would it be and why?',
    inputType: 'textarea',
  },

  // SECTION 3 — The Outcome: What Success Looks Like
  {
    id: 12,
    section: 'The Outcome - What Success Looks Like',
    prompt: 'In one or two sentences, what does this business look like in 90 days if AI tools are working well for you?',
    inputType: 'textarea',
  },
  {
    id: 13,
    section: 'The Outcome - What Success Looks Like',
    prompt: 'Rank your top priorities for the next 90 days.',
    inputType: 'ranking',
    options: [
      { value: 'free_up_owner_time', label: 'Free up my own time / reduce owner workload' },
      { value: 'respond_faster', label: 'Respond to leads / customers faster' },
      { value: 'more_marketing_content', label: 'Produce more marketing content consistently' },
      { value: 'reduce_admin_errors', label: 'Reduce errors in admin / bookkeeping' },
      { value: 'scale_without_hiring', label: 'Scale without hiring additional staff' },
    ],
    notes: '1 = highest priority, 5 = lowest, per the source doc.',
  },
  {
    id: 14,
    section: 'The Outcome - What Success Looks Like',
    prompt:
      'Is there a specific event driving the timing of this assessment (e.g., burnout, a busy season, a new hire decision, a specific complaint)?',
    inputType: 'textarea',
  },

  // SECTION 4 — Current Tools & Tech Stack
  {
    id: 15,
    section: 'Current Tools & Tech Stack',
    prompt: 'What software / platforms do you currently use for the following?',
    inputType: 'matrix',
    matrixRows: [
      'CRM / contact mgmt',
      'Email / calendar',
      'Accounting / invoicing',
      'Marketing / social media',
      'Project / task mgmt',
      'Customer support',
      'File storage',
    ],
    matrixColumns: [
      { key: 'toolsUsed', label: 'Tool(s) used' },
      { key: 'satisfied', label: 'Satisfied?' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    id: 16,
    section: 'Current Tools & Tech Stack',
    prompt: 'Have you already tried any AI tools (e.g., ChatGPT, Claude, Copilot, an AI chatbot, etc.)?',
    inputType: 'select',
    options: [],
    notes: 'Options not specified in the source requirements doc — confirm the actual list with the client before Module 11.',
  },
  {
    id: 17,
    section: 'Current Tools & Tech Stack',
    prompt: "If you've used AI tools before, what worked or didn't work?",
    inputType: 'textarea',
  },
  {
    id: 18,
    section: 'Current Tools & Tech Stack',
    prompt:
      'Is your business data (customer info, files, processes) centralized in a few systems, or scattered across many tools, spreadsheets, and inboxes?',
    inputType: 'select',
    options: [],
    notes: 'Options not specified in the source requirements doc — confirm the actual list with the client before Module 11.',
  },

  // SECTION 5 — Team Readiness
  {
    id: 19,
    section: 'Team Readiness',
    prompt: 'Overall comfort level with learning new software/technology',
    inputType: 'scale',
    notes: '1 = Low, 5 = High, per the source doc.',
  },
  {
    id: 20,
    section: 'Team Readiness',
    prompt: "Team's general openness to changing how they work day-to-day",
    inputType: 'scale',
    notes: '1 = Low, 5 = High, per the source doc.',
  },
  {
    id: 21,
    section: 'Team Readiness',
    prompt: 'Do you have any in-house IT support or a go-to tech-savvy person on the team?',
    inputType: 'select',
    options: [],
    notes: 'Options not specified in the source requirements doc — confirm the actual list with the client before Module 11.',
  },
  {
    id: 22,
    section: 'Team Readiness',
    prompt:
      'Are there any data privacy, security, or compliance requirements we should account for (e.g., HIPAA, PCI, client confidentiality agreements)?',
    inputType: 'textarea',
  },
  {
    id: 23,
    section: 'Team Readiness',
    prompt: 'Who needs to approve a new tool or subscription before it can be purchased?',
    inputType: 'text',
  },

  // SECTION 6 — Budget & Investment
  {
    id: 24,
    section: 'Budget & Investment',
    prompt: 'What monthly budget would you be comfortable allocating to AI tools/software in total?',
    inputType: 'select',
    options: [],
    notes: 'Options not specified in the source requirements doc — confirm the actual list with the client before Module 11.',
  },
  {
    id: 25,
    section: 'Budget & Investment',
    prompt: "Roughly what is an hour of your (or your team's) time worth to the business? A rough estimate is fine.",
    inputType: 'number',
    numberHint: '$ / hour',
  },
  {
    id: 26,
    section: 'Budget & Investment',
    prompt: 'How soon would you want to start implementing recommendations?',
    inputType: 'select',
    options: [],
    notes: 'Options not specified in the source requirements doc — confirm the actual list with the client before Module 11.',
  },

  // SECTION 7 — Function-Specific Deep Dive
  {
    id: 27,
    section: 'Function-Specific Deep Dive',
    prompt: 'How do you currently create marketing content (social posts, emails, blog posts)?',
    inputType: 'textarea',
  },
  {
    id: 28,
    section: 'Function-Specific Deep Dive',
    prompt: 'How many hours per week go into content creation, and who does it?',
    inputType: 'textarea',
  },
  {
    id: 29,
    section: 'Function-Specific Deep Dive',
    prompt: 'How do new leads reach you, and what happens to them after that (be specific about the manual steps)?',
    inputType: 'textarea',
  },
  {
    id: 30,
    section: 'Function-Specific Deep Dive',
    prompt: 'On average, how long does it take you to respond to a new lead?',
    inputType: 'text',
  },
  {
    id: 31,
    section: 'Function-Specific Deep Dive',
    prompt: 'What are the most common questions or requests you get from customers?',
    inputType: 'textarea',
  },
  {
    id: 32,
    section: 'Function-Specific Deep Dive',
    prompt: 'How are those currently handled: phone, email, chat, in person?',
    inputType: 'text',
  },
  {
    id: 33,
    section: 'Function-Specific Deep Dive',
    prompt: 'Walk us through how appointments/jobs get scheduled today, start to finish.',
    inputType: 'textarea',
  },
  {
    id: 34,
    section: 'Function-Specific Deep Dive',
    prompt: 'How is invoicing and bookkeeping currently handled, and by whom?',
    inputType: 'textarea',
  },

  // SECTION 8 — Wrap-Up
  {
    id: 35,
    section: 'Wrap-Up',
    prompt: 'Is there anything else about how your business runs that would help us tailor recommendations?',
    inputType: 'textarea',
  },
  {
    id: 36,
    section: 'Wrap-Up',
    prompt: 'Best contact info for scheduling your review call',
    inputType: 'contact',
    contactFields: ['email', 'phone'],
  },
];

export function getQuestionById(id: number): AssessmentQuestion | null {
  return ASSESSMENT_QUESTIONS.find((question) => question.id === id) || null;
}

export function getQuestionCount(): number {
  return ASSESSMENT_QUESTIONS.length;
}

export function getQuestionsBySection(section: string): AssessmentQuestion[] {
  return ASSESSMENT_QUESTIONS.filter((question) => question.section === section);
}

// Ordered, de-duplicated section names, derived from the question list
// itself rather than hand-maintained separately so the two can never drift.
export function getSectionNames(): string[] {
  const seen = new Set<string>();
  const sections: string[] = [];
  for (const question of ASSESSMENT_QUESTIONS) {
    if (!seen.has(question.section)) {
      seen.add(question.section);
      sections.push(question.section);
    }
  }
  return sections;
}
