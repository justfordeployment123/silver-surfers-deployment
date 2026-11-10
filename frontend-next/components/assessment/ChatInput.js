'use client';

import { useEffect, useState } from 'react';

// Render the approved controls and retain input when a request needs retry.
export default function ChatInput({ question, answers = [], onSubmit, disabled }) {
  const [value, setValue] = useState('');
  const [otherValue, setOtherValue] = useState('');
  const [selected, setSelected] = useState([]);
  const [matrix, setMatrix] = useState({});

  useEffect(() => {
    setValue('');
    setOtherValue('');
    setSelected([]);
    setMatrix({});
  }, [question?.id]);

  if (!question) return null;

  const hasOptions = Array.isArray(question.options) && question.options.length > 0;

  function submitText(e) {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  }

  function handleComposerKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitText(e);
    }
  }

  function submitDirect(text) {
    if (disabled || !text) return;
    onSubmit(text);
  }

  function submitSelect(e) {
    e.preventDefault();
    if (disabled || !value) return;
    if (value === 'Other (specify)') {
      const detail = otherValue.trim();
      if (!detail) return;
      onSubmit(`Other: ${detail}`);
      return;
    }
    onSubmit(value);
  }

  function toggleMultiselect(label) {
    setSelected((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  }

  const sharedStyle = (
    <style>{`
      .chat-input-row { display: flex; gap: 10px; margin-top: 8px; }
      .chat-input-row input[type="text"],
      .chat-input-row input[type="number"],
      .chat-input-row select,
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
      .chat-input-row select { min-width: 0; }
      .chat-composer { display: grid; gap: 8px; margin-top: 8px; }
      .chat-composer .chat-input-row { margin-top: 0; }
      .chat-input-hint, .chat-scale-legend { margin: 0; color: var(--ink3); font-size: 13px; }
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
      @media (max-width: 560px) {
        .chat-composer .chat-input-row { flex-direction: column; }
        .chat-composer .btn { width: 100%; }
      }
    `}</style>
  );

  if (question.inputType === 'matrix') {
    const source = answers.find(answer => answer.questionId === question.matrixRowsFromQuestionId)?.text || '';
    const rows = question.matrixRows || source.split(', ').filter(Boolean);
    const columns = question.matrixColumns || [];
    const painLabels = ['Mildly annoying', 'Somewhat annoying', 'Very annoying', 'Very painful', 'Actively holding the business back'];
    return <form className="chat-composer" onSubmit={event => {
      event.preventDefault();
      if (!disabled) onSubmit(JSON.stringify(rows.map(label => ({ function: label, ...(matrix[label] || {}) }))));
    }}>
      {sharedStyle}
      {rows.map(label => <fieldset key={label} style={{border:'1px solid var(--sandd)',borderRadius:12,padding:16,margin:0}} disabled={disabled}>
        <legend>{label}</legend>
        {question.id === 15 && <label style={{display:'block',marginTop:10}}><input type="checkbox" checked={matrix[label]?.toolsUsed === 'No tool currently used'} onChange={event => setMatrix(current => ({...current,[label]:event.target.checked ? {toolsUsed:'No tool currently used'} : {toolsUsed:''}}))} /> No tool currently used</label>}
        {columns.filter(column => question.id !== 15 || (matrix[label]?.toolsUsed !== 'No tool currently used' && (column.key !== 'notes' || ['No','Somewhat'].includes(matrix[label]?.satisfied)))).map(column => <label key={column.key} style={{display:'block',marginTop:10}}>
          {question.id === 15 && column.key === 'notes' ? 'What is not working well? Please explain.' : column.label}
          <div className="chat-input-row">
            {question.id === 15 && column.key === 'satisfied' ? <select required value={matrix[label]?.satisfied || ''} onChange={event => setMatrix(current => ({...current,[label]:{...current[label],satisfied:event.target.value,notes:''}}))}><option value="">Select satisfaction</option>{['Yes','Somewhat','No'].map(option => <option key={option}>{option}</option>)}</select> : column.key === 'pain' ? <select required value={matrix[label]?.[column.key] || ''} onChange={event => setMatrix(current => ({...current,[label]:{...current[label],[column.key]:event.target.value}}))}>
              <option value="">Select a pain rating</option>
              {painLabels.map((text, index) => <option key={text} value={index + 1}>{index + 1} - {text}</option>)}
            </select> : <input required type={column.key === 'hoursPerWeek' ? 'number' : 'text'} min={column.key === 'hoursPerWeek' ? 0 : undefined} max={column.key === 'hoursPerWeek' ? 168 : undefined} step={column.key === 'hoursPerWeek' ? 'any' : undefined} value={matrix[label]?.[column.key] || ''} onChange={event => setMatrix(current => ({...current,[label]:{...current[label],[column.key]:event.target.value}}))} />}
          </div>
        </label>)}
      </fieldset>)}
      {!rows.length && <p>Please go back and select at least one business function.</p>}
      <button type="submit" className="btn btn-p" disabled={disabled || !rows.length}>Send answer</button>
    </form>;
  }

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
        <p className="chat-scale-legend">{question.notes || '1 = lowest, 5 = highest'}</p>
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
    const needsOtherDetail = value === 'Other (specify)';

    return (
      <form className="chat-composer" onSubmit={submitSelect}>
        {sharedStyle}
        <div className="chat-input-row">
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={disabled}
            aria-label={question.prompt}
          >
            <option value="">Select an option</option>
            {question.options.map((option) => (
              <option
                key={option.value}
                value={option.label}
              >
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="btn btn-p"
            disabled={disabled || !value || (needsOtherDetail && !otherValue.trim())}
          >
            Send answer
          </button>
        </div>
        {needsOtherDetail && (
          <div className="chat-input-row">
            <input
              type="text"
              value={otherValue}
              onChange={(e) => setOtherValue(e.target.value)}
              disabled={disabled}
              aria-label="Describe the other industry"
              placeholder="Describe your industry"
            />
          </div>
        )}
      </form>
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
      <form className="chat-composer" onSubmit={submitText}>
        {sharedStyle}
        <div className="chat-input-row">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            disabled={disabled}
            aria-label={question.prompt}
          />
          <button type="submit" className="btn btn-p" disabled={disabled || !value.trim()}>Send answer</button>
        </div>
        <p className="chat-input-hint">Enter adds a new line. Ctrl + Enter sends your answer.</p>
      </form>
    );
  }

  // Text and fallback question types use the same composer behavior as
  // multi-line answers so Enter is consistent throughout the interview.
  return (
    <form className="chat-composer" onSubmit={submitText}>
      {sharedStyle}
      <div className="chat-input-row">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          disabled={disabled}
          aria-label={question.prompt}
        />
        <button type="submit" className="btn btn-p" disabled={disabled || !value.trim()}>Send answer</button>
      </div>
      <p className="chat-input-hint">Enter adds a new line. Ctrl + Enter sends your answer.</p>
    </form>
  );
}
