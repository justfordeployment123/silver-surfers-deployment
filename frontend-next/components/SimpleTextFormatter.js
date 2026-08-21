// Ported from frontend/src/components/SimpleTextFormatter.js. Pure function
// of its `text` prop, no hooks/browser APIs — safe as a Server Component.
//
// The original used Tailwind utility classes (text-3xl font-bold
// text-gray-900, prose max-w-none, etc.). Per the migration plan, rather
// than standing up a real Tailwind build for this one file, its typography
// is converted to the site's existing --ink/--ink6/--ffd design tokens
// (see app/globals.css) via a small scoped <style> block, matching the
// pattern used throughout the rest of the app.
const SimpleTextFormatter = ({ text }) => {
  if (!text) return null;

  const formatText = (input) => {
    const lines = input.split('\n');

    return lines.map((line, index) => {
      let element = null;

      if (line.startsWith('# ')) {
        element = <h1 key={index} className="stf-h1">{line.substring(2)}</h1>;
      } else if (line.startsWith('## ')) {
        element = <h2 key={index} className="stf-h2">{line.substring(3)}</h2>;
      } else if (line.startsWith('### ')) {
        element = <h3 key={index} className="stf-h3">{line.substring(4)}</h3>;
      } else if (line.trim() === '') {
        element = <br key={index} />;
      } else {
        let processedLine = line;

        // Bold text: **text**
        processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Italic text: *text*
        processedLine = processedLine.replace(/\*(.*?)\*/g, '<em>$1</em>');

        element = (
          <p
            key={index}
            className="stf-p"
            dangerouslySetInnerHTML={{ __html: processedLine }}
          />
        );
      }

      return element;
    });
  };

  return (
    <div className="stf-prose">
      <style>{`
        .stf-prose { max-width: none; }
        .stf-h1 { font-size: 30px; font-weight: 700; color: var(--ink); margin-bottom: 16px; }
        .stf-h2 { font-size: 24px; font-weight: 600; color: var(--ink); margin-bottom: 12px; }
        .stf-h3 { font-size: 20px; font-weight: 600; color: var(--ink6); margin-bottom: 8px; }
        .stf-p  { font-size: 16px; color: var(--ink6); margin-bottom: 12px; line-height: 1.7; }
        .stf-p strong { color: var(--ink); font-weight: 600; }
      `}</style>
      {formatText(text)}
    </div>
  );
};

export default SimpleTextFormatter;
