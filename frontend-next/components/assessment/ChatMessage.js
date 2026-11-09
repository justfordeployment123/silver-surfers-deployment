// Milestone 3.1 Developer Plan, Module 11. Plain bubble markup using
// existing design tokens — no third-party chat-UI library, matching the
// rest of the codebase having no component library dependency.
export default function ChatMessage({ role, text }) {
  const isAgent = role === 'agent';
  let displayText = text;
  if (!isAgent) {
    try {
      const rows = JSON.parse(text);
      if (Array.isArray(rows) && rows.every(row => typeof row.function === 'string')) {
        displayText = rows.map(row => `${row.function}\n${Object.entries(row).filter(([key]) => key !== 'function').map(([key, value]) => `${({hoursPerWeek:'Hours per week',pain:'Pain (1-5)',handledBy:'Handled by',toolsUsed:'Tools used',satisfied:'Satisfied',notes:'Notes'})[key] || key}: ${value}`).join('\n')}`).join('\n\n');
      }
    } catch { /* Existing free-text answers are displayed unchanged. */ }
  }

  return (
    <div
      className={`chat-msg ${isAgent ? 'chat-msg-agent' : 'chat-msg-customer'}`}
      role={isAgent ? 'status' : undefined}
    >
      <style>{`
        .chat-msg { display: flex; margin-bottom: 14px; }
        .chat-msg-agent { justify-content: flex-start; }
        .chat-msg-customer { justify-content: flex-end; }
        .chat-bubble {
          max-width: 75%;
          padding: 12px 16px;
          border-radius: var(--rl);
          font-size: 16px;
          line-height: 1.55;
          white-space: pre-wrap;
        }
        .chat-msg-agent .chat-bubble { background: var(--surface); border: 1px solid var(--sandd); color: var(--ink); }
        .chat-msg-customer .chat-bubble { background: var(--t6); color: #fff; }
      `}</style>
      <div className="chat-bubble">{displayText}</div>
    </div>
  );
}
