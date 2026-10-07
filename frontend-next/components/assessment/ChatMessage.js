// Milestone 3.1 Developer Plan, Module 11. Plain bubble markup using
// existing design tokens — no third-party chat-UI library, matching the
// rest of the codebase having no component library dependency.
export default function ChatMessage({ role, text }) {
  const isAgent = role === 'agent';

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
      <div className="chat-bubble">{text}</div>
    </div>
  );
}
