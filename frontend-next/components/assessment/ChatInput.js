'use client';

import { useEffect, useState } from 'react';

// Milestone 3.1 Developer Plan, Module 11. Adapts to the current question's
// inputType. Only text/textarea/number/scale get a dedicated control;
// select/multiselect/ranking render as buttons/checkboxes when the question
// actually has options, otherwise (and for matrix/contact, which have no
// simple single-control shape) this falls back to a plain textarea — the
// backend already accepts any free-text answerText regardless of
// inputType, so the fallback is fully functional, just less polished. Six
// questions (Module 9) have empty option lists in the source doc itself,
// which is exactly the case this fallback exists for.
export default function ChatInput({ question, onSubmit, disabled }) {
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    setValue('');
    setSelected([]);
  }, [question?.id]);

  if (!question) return null;

  const hasOptions = Array.isArray(question.options) && question.options.length > 0;

  function submitText(e) {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  }

  function submitDirect(text) {
    if (disabled || !text) return;
    onSubmit(text);
  }

  function toggleMultiselect(label) {
    setSelected((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  }

  const sharedStyle = (
    <style>{`
      .chat-input-row { display: flex; gap: 10px; margin-top: 8px; }
      .chat-input-row input[type="text"],
      .chat-input-row input[type="number"],
      .chat-input-row textarea {
        flex: 1;
        padding: 12px 14px;
        border: 1px solid var(--sandd);
        border-radius: var(--r);
        font-size: 16px;
        font-family: var(--ff);
        color: var(--ink);
        background: var(--surface);
      }
      .chat-input-row textarea { min-height: 72px; resize: vertical; }
      .chat-option-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .chat-option-btn {
        padding: 10px 16px;
        border: 1px solid var(--sandd);
        border-radius: 999px;
        background: var(--surface);
        color: var(--ink);
        font-size: 15px;
        cursor: pointer;
      }
      .chat-option-btn:hover { border-color: var(--t6); color: var(--t6); }
      .chat-option-btn.selected { background: var(--t6); border-color: var(--t6); color: #fff; }
    `}</style>
  );

  if (question.inputType === 'number') {
    return (
      <form className="chat-input-row" onSubmit={submitText}>
        {sharedStyle}
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          aria-label={question.prompt}
          placeholder={question.numberHint || 'Enter a number'}
        />
        <button type="submit" className="btn btn-p" disabled={disabled || !value.trim()}>Send</button>
      </form>
    );
  }

  if (question.inputType === 'scale') {
    return (
      <div>
        {sharedStyle}
        <div className="chat-option-list">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className="chat-option-btn"
              disabled={disabled}
              onClick={() => submitDirect(String(n))}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.inputType === 'select' && hasOptions) {
    return (
      <div>
        {sharedStyle}
        <div className="chat-option-list">
          {question.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="chat-option-btn"
              disabled={disabled}
              onClick={() => submitDirect(option.label)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.inputType === 'multiselect' && hasOptions) {
    return (
      <div>
        {sharedStyle}
        <div className="chat-option-list">
          {question.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`chat-option-btn${selected.includes(option.label) ? ' selected' : ''}`}
              disabled={disabled}
              onClick={() => toggleMultiselect(option.label)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="chat-input-row">
          <button
            type="button"
            className="btn btn-p"
            disabled={disabled || selected.length === 0}
            onClick={() => submitDirect(selected.join(', '))}
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  if (question.inputType === 'textarea') {
    return (
      <form className="chat-input-row" onSubmit={submitText}>
        {sharedStyle}
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          aria-label={question.prompt}
        />
        <button type="submit" className="btn btn-p" disabled={disabled || !value.trim()}>Send</button>
      </form>
    );
  }

  // text, ranking, matrix, contact, and any select/multiselect with no
  // listed options — free text is always a valid, fully-supported answer.
  return (
    <form className="chat-input-row" onSubmit={submitText}>
      {sharedStyle}
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        aria-label={question.prompt}
      />
      <button type="submit" className="btn btn-p" disabled={disabled || !value.trim()}>Send</button>
    </form>
  );
}
