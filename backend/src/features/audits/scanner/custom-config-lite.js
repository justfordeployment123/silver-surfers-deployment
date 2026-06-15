export default {
  categories: {
    'senior-friendly-lite': {
      title: 'Senior Accessibility (Lite)',
      description: 'Essential accessibility checks for senior users using built-in Lighthouse audits plus custom font analysis.',
      
      auditRefs: [
        { id: 'color-contrast', weight: 5 },
        { id: 'target-size', weight: 5 },
        { id: 'text-font-audit', weight: 5 },
        { id: 'viewport', weight: 3 },
        { id: 'link-name', weight: 3 },
        { id: 'button-name', weight: 3 },
        { id: 'label', weight: 3 },
        { id: 'heading-order', weight: 2 },
        { id: 'is-on-https', weight: 2 },
        { id: 'cumulative-layout-shift', weight: 1 },
        { id: 'user-scalable-audit', weight: 2 },
        { id: 'horizontal-scroll-audit', weight: 1 },
        { id: 'text-size-adjust-audit', weight: 1 },
        { id: 'image-alt', weight: 3 },
      ],
    },
  },
};
