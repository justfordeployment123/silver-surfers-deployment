// Maps {productType, status} to the dashboard's status label and next
// action, per Milestone 3.1 Developer Plan Module 3's table. Adding a 4th
// product type later is one more case in these two functions, not a new
// component — ProductStatusCard.js stays generic.

const STATUS_LABELS = {
  course: {
    not_started: 'Not started',
    in_progress: 'In progress',
    complete: 'Complete',
  },
  assessment: {
    purchased: 'Purchased',
    scheduled: 'Scheduled',
    intake_in_progress: 'In progress',
    intake_complete: 'Intake complete',
    pending_review: 'Report in review',
    report_ready: 'Report ready',
    delivered: 'Delivered',
  },
  ebook: {
    purchased: 'Purchased',
  },
};

export function getStatusLabel(productType, status) {
  return STATUS_LABELS[productType]?.[status] || status;
}

// Returns { label, href } for the primary CTA, or null when there's nothing
// actionable yet (e.g. a report still in staff review).
export function getNextAction(productType, status, id) {
  switch (productType) {
    case 'course':
      switch (status) {
        case 'not_started':
          return { label: 'Start Course', href: `/courses/${id}` };
        case 'in_progress':
          return { label: 'Continue Course', href: `/courses/${id}` };
        case 'complete':
          return { label: 'Review Course', href: `/courses/${id}` };
        default:
          return null;
      }
    case 'assessment':
      switch (status) {
        case 'purchased':
          return { label: 'Schedule Assessment', href: `/assessment/${id}` };
        case 'scheduled':
        case 'intake_in_progress':
          return { label: 'Continue Assessment', href: `/assessment/${id}` };
        case 'report_ready':
        case 'delivered':
          return { label: 'View Results', href: `/assessment/${id}` };
        // 'intake_complete' and 'pending_review': no customer-facing action
        // while staff review is pending — intentionally falls through.
        default:
          return null;
      }
    case 'ebook':
      // No dedicated page — Module 16's download link is generated
      // on demand and redirected to directly (see ProductStatusCard's
      // download-trigger branch), not a navigable route.
      return { label: 'Access eBook', download: true };
    default:
      return null;
  }
}
