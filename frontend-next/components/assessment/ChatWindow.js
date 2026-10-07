'use client';

import { useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';

// Milestone 3.1 Developer Plan, Module 11. Turn-based, not streaming
// (Architecture Decision 2.4) — onSend awaits a single POST /respond and
// the parent re-renders with the updated transcript, no WebSocket/SSE.
export default function ChatWindow({ transcript, currentQuestion, onSend, sending }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript.length]);

  return (
    <div className="chat-window">
      <style>{`
        .chat-window { display: flex; flex-direction: column; height: 100%; }
        .chat-transcript {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          border: 1px solid var(--sandd);
          border-radius: var(--rl);
          background: var(--bg);
          min-height: 360px;
          max-height: 520px;
          margin-bottom: 16px;
        }
        .chat-thinking { font-size: 15px; color: var(--ink3); font-style: italic; margin-top: 4px; }
      `}</style>

      {/* Current question is announced here so screen-reader users hear it
          advance without needing to re-scan the whole scrolling transcript. */}
      <div aria-live="polite" className="sr-only-visually-hidden" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
        {currentQuestion?.prompt}
      </div>

      <div className="chat-transcript" ref={scrollRef}>
        {transcript.map((entry, index) => (
          // Transcript entries have no stable id from the backend (plain
          // array, not a sub-document with _id) — index is safe here since
          // this list is append-only and never reordered.
          // eslint-disable-next-line react/no-array-index-key
          <ChatMessage key={index} role={entry.role} text={entry.text} />
        ))}
        {sending && <p className="chat-thinking">Thinking…</p>}
      </div>

      {currentQuestion && <ChatInput question={currentQuestion} onSubmit={onSend} disabled={sending} />}
    </div>
  );
}
