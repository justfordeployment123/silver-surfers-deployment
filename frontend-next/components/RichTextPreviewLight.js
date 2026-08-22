// Ported from the RichTextPreviewLight export in
// frontend/src/components/RichTextEditor.js (the admin rich-text editor
// itself isn't ported yet — this is only the read-only preview renderer
// used by public blog pages). Pure function of its `content` prop, no
// hooks — safe as a Server Component.
//
// Converted from Tailwind utility classes (one of the 6 files identified
// in the migration plan as using them) to the site's design-token system,
// same approach as components/SimpleTextFormatter.js.
const RichTextPreviewLight = ({ content }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const formatted = lines.map((line, index) => {
    if (line.startsWith('### ')) {
      return <h3 key={`h3-${index}`} className="rtpl-h3">{line.substring(4)}</h3>;
    }
    if (line.startsWith('## ')) {
      return <h2 key={`h2-${index}`} className="rtpl-h2">{line.substring(3)}</h2>;
    }
    if (line.startsWith('# ')) {
      return <h1 key={`h1-${index}`} className="rtpl-h1">{line.substring(2)}</h1>;
    }
    if (line.startsWith('> ')) {
      return <blockquote key={`quote-${index}`} className="rtpl-quote">{line.substring(2)}</blockquote>;
    }
    if (line.startsWith('- ')) {
      return <li key={`li-${index}`} className="rtpl-li">{line.substring(2)}</li>;
    }
    if (/^\d+\. /.test(line)) {
      return <li key={`li-num-${index}`} className="rtpl-li rtpl-li-num">{line.replace(/^\d+\. /, '')}</li>;
    }

    if (line.trim()) {
      const formattedLine = line
        .replace(/\*\*(.*?)\*\*/g, '<strong class="rtpl-strong">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="rtpl-em">$1</em>')
        .replace(/`(.*?)`/g, '<code class="rtpl-code">$1</code>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="rtpl-link" target="_blank" rel="noopener noreferrer">$1</a>');

      return <p key={`p-${index}`} className="rtpl-p" dangerouslySetInnerHTML={{ __html: formattedLine }} />;
    }

    return <br key={`br-${index}`} />;
  });

  return (
    <div>
      <style>{`
        .rtpl-h1 { font-size: 30px; font-weight: 700; margin: 24px 0 16px; color: var(--ink); border-bottom: 2px solid var(--sandd); padding-bottom: 12px; }
        .rtpl-h2 { font-size: 24px; font-weight: 700; margin: 24px 0 16px; color: var(--ink); border-bottom: 2px solid var(--t1); padding-bottom: 8px; }
        .rtpl-h3 { font-size: 20px; font-weight: 700; margin: 24px 0 12px; color: var(--ink); border-bottom: 1px solid var(--sandd); padding-bottom: 8px; }
        .rtpl-quote { border-left: 4px solid var(--sandd); padding: 8px 16px; font-style: italic; color: var(--ink6); margin: 16px 0; background: var(--sand); border-radius: 0 var(--r) var(--r) 0; }
        .rtpl-li { margin-left: 16px; color: var(--ink6); margin-bottom: 4px; list-style: disc; }
        .rtpl-li-num { list-style: decimal; }
        .rtpl-p { margin-bottom: 16px; color: var(--ink6); line-height: 1.7; }
        .rtpl-strong { color: var(--ink); font-weight: 700; }
        .rtpl-em { color: var(--ink6); font-style: italic; }
        .rtpl-code { background: var(--t05); color: var(--ink); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace; border: 1px solid var(--sandd); }
        .rtpl-link { color: var(--tlink); text-decoration: underline; }
      `}</style>
      {formatted}
    </div>
  );
};

export default RichTextPreviewLight;
