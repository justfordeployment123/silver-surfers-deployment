'use client';

// Ported from the default export of frontend/src/components/RichTextEditor.js
// (the admin content editor itself — distinct from the read-only
// RichTextPreviewLight/Dark.js already ported for public blog pages).
// Converted from Tailwind utility classes to the design-token CSS system,
// same approach as SearchBar.js and SimpleTextFormatter.js.
import { useState, useRef } from 'react';

const STYLES = `
.rte-toolbar { background: var(--sand); border: 1px solid var(--sandd); border-radius: var(--r); padding: 12px; }
.rte-toolbar-row { display: flex; flex-wrap: wrap; gap: 8px; }
.rte-fmt-btn { padding: 8px 12px; font-size: 16px; border: 1px solid var(--sandd); border-radius: 6px; background: var(--surface); color: var(--ink); cursor: pointer; transition: background .15s, border-color .15s; }
.rte-fmt-btn:hover { background: var(--sand); border-color: var(--ink3); }
.rte-hint { margin-top: 8px; font-size: 16px; color: var(--ink3); }
.rte-hint span { margin-right: 16px; }
.rte-textarea-wrap { position: relative; }
.rte-textarea {
  width: 100%; padding: 12px 16px; border: 1px solid var(--sandd); border-radius: var(--r);
  outline: none; resize: none; color: var(--ink); background: var(--surface); font-family: monospace;
  font-size: 16px; line-height: 1.6; box-sizing: border-box; transition: border-color .15s, box-shadow .15s;
}
.rte-textarea:focus { border-color: var(--t4); box-shadow: 0 0 0 3px var(--t05); }
.rte-count { position: absolute; bottom: 8px; right: 12px; font-size: 16px; color: var(--ink3); background: var(--surface); padding: 2px 8px; border-radius: 4px; }
.rte-preview { border: 2px solid var(--sandd); border-radius: var(--r); padding: 24px; background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.rte-preview-hdr { font-size: 16px; font-weight: 600; color: var(--ink); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.rte-preview-body { border-left: 4px solid var(--t1); padding-left: 16px; }
.rtp-h1 { font-size: 26px; font-weight: 700; margin: 20px 0 14px; color: var(--ink); border-bottom: 2px solid var(--t6); padding-bottom: 10px; }
.rtp-h2 { font-size: 21px; font-weight: 700; margin: 20px 0 14px; color: var(--ink); border-bottom: 2px solid var(--t2); padding-bottom: 6px; }
.rtp-h3 { font-size: 18px; font-weight: 700; margin: 20px 0 10px; color: var(--ink); border-bottom: 1px solid var(--sandd); padding-bottom: 6px; }
.rtp-quote { border-left: 4px solid var(--ink3); padding: 8px 14px; font-style: italic; color: var(--ink6); margin: 14px 0; background: var(--sand); border-radius: 0 var(--r) var(--r) 0; }
.rtp-li { margin-left: 16px; color: var(--ink); margin-bottom: 4px; list-style: disc; }
.rtp-li-num { list-style: decimal; }
.rtp-p { margin-bottom: 14px; color: var(--ink); line-height: 1.7; font-size: 16px; }
.rtp-strong { color: var(--ink); font-weight: 700; }
.rtp-em { color: var(--ink6); font-style: italic; }
.rtp-code { background: var(--sand); color: var(--ink); padding: 2px 8px; border-radius: 4px; font-size: 16px; font-family: monospace; border: 1px solid var(--sandd); }
.rtp-link { color: var(--tlink); text-decoration: underline; }
`;

const RichTextEditor = ({ value, onChange, placeholder = "Write your content here...", rows = 12 }) => {
  const textareaRef = useRef(null);

  const handleTextChange = (e) => {
    onChange(e.target.value);
  };

  const insertFormatting = (before, after = '', fallback = 'text') => {
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = value;

    const beforeText = text.substring(0, start);
    const selectedText = text.substring(start, end);
    const afterText = text.substring(end);

    const replacement = before + (selectedText || fallback) + after;
    const newText = beforeText + replacement + afterText;

    onChange(newText);

    // Set cursor position after the inserted text
    setTimeout(() => {
      const newCursorPos = start + before.length + (selectedText || fallback).length + after.length;
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const formatButtons = [
    { label: 'Bold', icon: 'B', action: () => insertFormatting('**', '**', 'bold text') },
    { label: 'Italic', icon: 'I', action: () => insertFormatting('*', '*', 'italic text') },
    { label: 'Heading 1', icon: 'H1', action: () => insertFormatting('# ', '', 'Main Heading') },
    { label: 'Heading 2', icon: 'H2', action: () => insertFormatting('## ', '', 'Sub Heading') },
    { label: 'Heading 3', icon: 'H3', action: () => insertFormatting('### ', '', 'Small Heading') },
    { label: 'Bullet List', icon: '•', action: () => insertFormatting('- ', '', 'List item') },
    { label: 'Numbered List', icon: '1.', action: () => insertFormatting('1. ', '', 'Numbered item') },
    { label: 'Quote', icon: '"', action: () => insertFormatting('> ', '', 'Quote text') },
    { label: 'Code', icon: '{}', action: () => insertFormatting('`', '`', 'code') },
    { label: 'Link', icon: '🔗', action: () => insertFormatting('[', '](url)', 'link text') },
  ];

  const handleKeyDown = (e) => {
    if (e.ctrlKey && e.key === 'b') { e.preventDefault(); insertFormatting('**', '**', 'bold text'); }
    if (e.ctrlKey && e.key === 'i') { e.preventDefault(); insertFormatting('*', '*', 'italic text'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <style>{STYLES}</style>

      {/* Formatting Toolbar */}
      <div className="rte-toolbar">
        <div className="rte-toolbar-row">
          {formatButtons.map((button) => (
            <button key={button.label} type="button" onClick={button.action} className="rte-fmt-btn" title={button.label}>
              {button.icon}
            </button>
          ))}
        </div>
        <div className="rte-hint">
          <span>💡 Tip: Use Ctrl+B for bold, Ctrl+I for italic</span>
          <span>Select text and click formatting buttons to apply styles</span>
        </div>
      </div>

      {/* Text Editor */}
      <div className="rte-textarea-wrap">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          className="rte-textarea"
        />
        <div className="rte-count">
          {value.split(' ').filter(word => word.length > 0).length} words • {value.length} characters
        </div>
      </div>

      {/* Preview Section */}
      {value && (
        <div className="rte-preview">
          <h4 className="rte-preview-hdr">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--t6)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview:
          </h4>
          <div className="rte-preview-body">
            <RichTextPreview content={value} />
          </div>
        </div>
      )}
    </div>
  );
};

// Live preview rendered inside the editor as content is typed — distinct
// from (and simpler than) the site-facing RichTextPreviewLight/Dark
// components, matching the original's own separate formatter.
const RichTextPreview = ({ content }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const formatted = lines.map((line, index) => {
    if (line.startsWith('### ')) return <h3 key={index} className="rtp-h3">{line.substring(4)}</h3>;
    if (line.startsWith('## ')) return <h2 key={index} className="rtp-h2">{line.substring(3)}</h2>;
    if (line.startsWith('# ')) return <h1 key={index} className="rtp-h1">{line.substring(2)}</h1>;
    if (line.startsWith('> ')) return <blockquote key={index} className="rtp-quote">{line.substring(2)}</blockquote>;
    if (line.startsWith('- ')) return <li key={index} className="rtp-li">{line.substring(2)}</li>;
    if (/^\d+\. /.test(line)) return <li key={index} className="rtp-li rtp-li-num">{line.replace(/^\d+\. /, '')}</li>;

    if (line.trim()) {
      const formattedLine = line
        .replace(/\*\*(.*?)\*\*/g, '<strong class="rtp-strong">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="rtp-em">$1</em>')
        .replace(/`(.*?)`/g, '<code class="rtp-code">$1</code>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="rtp-link" target="_blank" rel="noopener noreferrer">$1</a>');
      return <p key={index} className="rtp-p" dangerouslySetInnerHTML={{ __html: formattedLine }} />;
    }

    return <br key={`br-${index}`} />;
  });

  return <div>{formatted}</div>;
};

export default RichTextEditor;
