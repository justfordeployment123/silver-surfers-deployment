// Ported from the RichTextPreviewDark export in
// frontend/src/components/RichTextEditor.js — the dark-background variant
// used for the blog post excerpt banner (which sits directly on the
// permanently-dark page background). Converted from Tailwind to the
// design-token system, same approach as RichTextPreviewLight.js.
//
// NOTE: the original CRA component also used this dark (white-text)
// variant for the post BODY content, which renders inside a light
// (var(--surface)) card — white-on-white, illegible. Fixed in
// app/blog/[id]/page.js by using RichTextPreviewLight for body content
// instead; this dark variant is only used here for the excerpt banner.
const RichTextPreviewDark = ({ content }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const formatted = lines.map((line, index) => {
    if (line.startsWith('### ')) {
      return <h3 key={`h3-${index}`} className="rtpd-h3">{line.substring(4)}</h3>;
    }
    if (line.startsWith('## ')) {
      return <h2 key={`h2-${index}`} className="rtpd-h2">{line.substring(3)}</h2>;
    }
    if (line.startsWith('# ')) {
      return <h1 key={`h1-${index}`} className="rtpd-h1">{line.substring(2)}</h1>;
    }
    if (line.startsWith('> ')) {
      return <blockquote key={`quote-${index}`} className="rtpd-quote">{line.substring(2)}</blockquote>;
    }
    if (line.startsWith('- ')) {
      return <li key={`li-${index}`} className="rtpd-li">{line.substring(2)}</li>;
    }
    if (/^\d+\. /.test(line)) {
      return <li key={`li-num-${index}`} className="rtpd-li rtpd-li-num">{line.replace(/^\d+\. /, '')}</li>;
    }

    if (line.trim()) {
      const formattedLine = line
        .replace(/\*\*(.*?)\*\*/g, '<strong class="rtpd-strong">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="rtpd-em">$1</em>')
        .replace(/`(.*?)`/g, '<code class="rtpd-code">$1</code>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="rtpd-link" target="_blank" rel="noopener noreferrer">$1</a>');

      return <p key={`p-${index}`} className="rtpd-p" dangerouslySetInnerHTML={{ __html: formattedLine }} />;
    }

    return <br key={`br-${index}`} />;
  });

  return (
    <div>
      <style>{`
        .rtpd-h1 { font-size: 30px; font-weight: 700; margin: 24px 0 16px; color: #fff; border-bottom: 2px solid var(--t4); padding-bottom: 12px; }
        .rtpd-h2 { font-size: 24px; font-weight: 700; margin: 24px 0 16px; color: #fff; border-bottom: 2px solid var(--t2); padding-bottom: 8px; }
        .rtpd-h3 { font-size: 20px; font-weight: 700; margin: 24px 0 12px; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 8px; }
        .rtpd-quote { border-left: 4px solid var(--t4); padding: 8px 16px; font-style: italic; color: var(--t1); margin: 16px 0; background: rgba(255,255,255,0.08); border-radius: 0 var(--r) var(--r) 0; }
        .rtpd-li { margin-left: 16px; color: #fff; margin-bottom: 4px; list-style: disc; }
        .rtpd-li-num { list-style: decimal; }
        .rtpd-p { margin-bottom: 16px; color: rgba(255,255,255,0.85); line-height: 1.7; font-size: 17px; }
        .rtpd-strong { color: #fff; font-weight: 700; }
        .rtpd-em { color: var(--t1); font-style: italic; }
        .rtpd-code { background: rgba(0,0,0,0.3); color: var(--t2); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace; border: 1px solid rgba(255,255,255,0.15); }
        .rtpd-link { color: var(--t2); text-decoration: underline; }
      `}</style>
      {formatted}
    </div>
  );
};

export default RichTextPreviewDark;
