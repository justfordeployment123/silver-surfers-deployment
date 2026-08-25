import React, { useState, useRef, useEffect } from 'react';

const RichTextEditor = ({ value, onChange, placeholder = "Write your content here...", rows = 12 }) => {
  const [selectedText, setSelectedText] = useState('');
  const textareaRef = useRef(null);

  const handleTextChange = (e) => {
    onChange(e.target.value);
  };

  const insertFormatting = (before, after = '', placeholder = 'text') => {
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = value;
    
    const beforeText = text.substring(0, start);
    const selectedText = text.substring(start, end);
    const afterText = text.substring(end);
    
    const replacement = before + (selectedText || placeholder) + after;
    const newText = beforeText + replacement + afterText;
    
    onChange(newText);
    
    // Set cursor position after the inserted text
    setTimeout(() => {
      const newCursorPos = start + before.length + (selectedText || placeholder).length + after.length;
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const formatButtons = [
    {
      label: 'Bold',
      icon: 'B',
      action: () => insertFormatting('**', '**', 'bold text'),
      className: 'font-bold bg-gray-200 hover:bg-gray-300 text-gray-800'
    },
    {
      label: 'Italic',
      icon: 'I',
      action: () => insertFormatting('*', '*', 'italic text'),
      className: 'italic bg-gray-200 hover:bg-gray-300 text-gray-800'
    },
    {
      label: 'Heading 1',
      icon: 'H1',
      action: () => insertFormatting('# ', '', 'Main Heading'),
      className: 'font-bold text-lg bg-blue-100 hover:bg-blue-200 text-blue-800'
    },
    {
      label: 'Heading 2',
      icon: 'H2',
      action: () => insertFormatting('## ', '', 'Sub Heading'),
      className: 'font-bold text-base bg-green-100 hover:bg-green-200 text-green-800'
    },
    {
      label: 'Heading 3',
      icon: 'H3',
      action: () => insertFormatting('### ', '', 'Small Heading'),
      className: 'font-bold text-sm bg-purple-100 hover:bg-purple-200 text-purple-800'
    },
    {
      label: 'Bullet List',
      icon: '•',
      action: () => insertFormatting('- ', '', 'List item'),
      className: 'text-lg bg-gray-200 hover:bg-gray-300 text-gray-800'
    },
    {
      label: 'Numbered List',
      icon: '1.',
      action: () => insertFormatting('1. ', '', 'Numbered item'),
      className: 'text-sm bg-gray-200 hover:bg-gray-300 text-gray-800'
    },
    {
      label: 'Quote',
      icon: '"',
      action: () => insertFormatting('> ', '', 'Quote text'),
      className: 'text-lg bg-yellow-100 hover:bg-yellow-200 text-yellow-800'
    },
    {
      label: 'Code',
      icon: '{}',
      action: () => insertFormatting('`', '`', 'code'),
      className: 'text-xs font-mono bg-gray-200 hover:bg-gray-300 text-gray-800'
    },
    {
      label: 'Link',
      icon: 'Link',
      action: () => insertFormatting('[', '](url)', 'link text'),
      className: 'text-sm bg-gray-200 hover:bg-gray-300 text-gray-800'
    }
  ];

  const handleKeyDown = (e) => {
    // Handle Ctrl+B for bold
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      insertFormatting('**', '**', 'bold text');
    }
    // Handle Ctrl+I for italic
    if (e.ctrlKey && e.key === 'i') {
      e.preventDefault();
      insertFormatting('*', '*', 'italic text');
    }
  };

  return (
    <div className="space-y-4">
      {/* Formatting Toolbar */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div className="flex flex-wrap gap-2">
          {formatButtons.map((button, index) => (
            <button
              key={index}
              type="button"
              onClick={button.action}
              className={`px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-100 hover:border-gray-400 transition-colors ${button.className}`}
              /* Tailwind is a dependency but never imported (no @tailwind
                 directive or config), so text-sm never applies and this button
                 falls back to the ~13.3px UA default. Set it explicitly. */
              style={{ fontSize: '16px' }}
              title={button.label}
            >
              {button.icon}
            </button>
          ))}
        </div>
        <div className="mt-2 text-xs text-gray-500">
          <span className="mr-4">Tip: Use Ctrl+B for bold, Ctrl+I for italic</span>
          <span>Select text and click formatting buttons to apply styles</span>
        </div>
      </div>

      {/* Text Editor */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors resize-none text-gray-900 bg-white font-mono text-sm leading-relaxed"
        />
        
        {/* Character and Word Count */}
        <div className="absolute bottom-2 right-3 text-xs text-gray-400 bg-white px-2 py-1 rounded">
          {value.split(' ').filter(word => word.length > 0).length} words • {value.length} characters
        </div>
      </div>

      {/* Preview Section */}
      {value && (
        <div className="border-2 border-gray-300 rounded-lg p-6 bg-white shadow-sm">
          <h4 className="text-sm font-medium text-gray-800 mb-4 flex items-center">
            <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview:
          </h4>
          <div className="prose prose-sm max-w-none border-l-4 border-blue-200 pl-4">
            <RichTextPreview content={value} />
          </div>
        </div>
      )}
    </div>
  );
};

// Component to render the formatted content preview
const RichTextPreview = ({ content }) => {
  const formatContent = (text) => {
    if (!text) return '';
    
    // Split content into lines for processing
    const lines = text.split('\n');
    const formattedLines = lines.map((line, index) => {
      let formattedLine = line;
      
      // Handle headings
      if (line.startsWith('### ')) {
        return <h3 key={index} className="text-xl font-bold mt-6 mb-3 text-gray-900 border-b border-gray-300 pb-2">{line.substring(4)}</h3>;
      } else if (line.startsWith('## ')) {
        return <h2 key={index} className="text-2xl font-bold mt-6 mb-4 text-gray-900 border-b-2 border-blue-500 pb-2">{line.substring(3)}</h2>;
      } else if (line.startsWith('# ')) {
        return <h1 key={index} className="text-3xl font-bold mt-6 mb-4 text-gray-900 border-b-2 border-blue-600 pb-3">{line.substring(2)}</h1>;
      }
      
      // Handle quotes
      if (line.startsWith('> ')) {
        return <blockquote key={index} className="border-l-4 border-gray-400 pl-4 italic text-gray-700 my-4 bg-gray-50 py-2 rounded-r">{line.substring(2)}</blockquote>;
      }
      
      // Handle lists
      if (line.startsWith('- ')) {
        return <li key={index} className="ml-4 list-disc text-gray-800 mb-1">{line.substring(2)}</li>;
      } else if (/^\d+\. /.test(line)) {
        return <li key={index} className="ml-4 list-decimal text-gray-800 mb-1">{line.replace(/^\d+\. /, '')}</li>;
      }
      
      // Handle inline formatting
      if (line.trim()) {
        formattedLine = formattedLine
          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900 font-bold">$1</strong>') // Bold
          .replace(/\*(.*?)\*/g, '<em class="text-gray-700 italic">$1</em>') // Italic
          .replace(/`(.*?)`/g, '<code class="bg-gray-200 text-gray-800 px-2 py-1 rounded text-sm font-mono border border-gray-300">$1</code>') // Code
          .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-800 hover:underline transition-colors" target="_blank" rel="noopener noreferrer">$1</a>'); // Links
        
        return <p key={index} className="mb-4 text-gray-800 leading-relaxed text-lg" dangerouslySetInnerHTML={{ __html: formattedLine }} />;
      }
      
      return <br key={`br-light-${index}`} />;
    });
    
    return formattedLines;
  };

  return <div>{formatContent(content)}</div>;
};

export default RichTextEditor;
export { RichTextPreview };

// Dark version specifically for blog posts on dark backgrounds
export const RichTextPreviewDark = ({ content }) => {
  const formatContent = (text) => {
    if (!text) return '';
    
    // Split content into lines for processing
    const lines = text.split('\n');
    const formattedLines = lines.map((line, index) => {
      let formattedLine = line;
      
      // Handle headings
      if (line.startsWith('### ')) {
        return <h3 key={index} className="text-xl font-bold mt-6 mb-3 text-white border-b border-white/30 pb-2">{line.substring(4)}</h3>;
      } else if (line.startsWith('## ')) {
        return <h2 key={index} className="text-2xl font-bold mt-6 mb-4 text-white border-b-2 border-blue-400 pb-2">{line.substring(3)}</h2>;
      } else if (line.startsWith('# ')) {
        return <h1 key={index} className="text-3xl font-bold mt-6 mb-4 text-white border-b-2 border-blue-500 pb-3">{line.substring(2)}</h1>;
      }
      
      // Handle quotes
      if (line.startsWith('> ')) {
        return <blockquote key={index} className="border-l-4 border-blue-400 pl-4 italic text-blue-100 my-4 bg-white/10 py-2 rounded-r">{line.substring(2)}</blockquote>;
      }
      
      // Handle lists
      if (line.startsWith('- ')) {
        return <li key={index} className="ml-4 list-disc text-white mb-1">{line.substring(2)}</li>;
      } else if (/^\d+\. /.test(line)) {
        return <li key={index} className="ml-4 list-decimal text-white mb-1">{line.replace(/^\d+\. /, '')}</li>;
      }
      
      // Handle inline formatting
      if (line.trim()) {
        formattedLine = formattedLine
          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>') // Bold
          .replace(/\*(.*?)\*/g, '<em class="text-blue-100 italic">$1</em>') // Italic
          .replace(/`(.*?)`/g, '<code class="bg-gray-800 text-green-300 px-2 py-1 rounded text-sm font-mono border border-gray-600">$1</code>') // Code
          .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-blue-300 hover:text-blue-100 hover:underline transition-colors" target="_blank" rel="noopener noreferrer">$1</a>'); // Links
        
        return <p key={index} className="mb-4 text-white leading-relaxed text-lg" dangerouslySetInnerHTML={{ __html: formattedLine }} />;
      }
      
      return <br key={`br-light-${index}`} />;
    });
    
    return formattedLines;
  };

  return <div>{formatContent(content)}</div>;
};

// Light version for light backgrounds (like blog list page)
export const RichTextPreviewLight = ({ content }) => {
  const formatContent = (text) => {
    if (!text) return '';
    
    // Split content into lines for processing
    const lines = text.split('\n');
    const formattedLines = lines.map((line, index) => {
      let formattedLine = line;
      
      // Handle headings
      if (line.startsWith('### ')) {
        return <h3 key={`h3-${index}-${line.substring(0, 10)}`} className="text-xl font-bold mt-6 mb-3 text-gray-900 border-b border-gray-200 pb-2">{line.substring(4)}</h3>;
      } else if (line.startsWith('## ')) {
        return <h2 key={`h2-${index}-${line.substring(0, 10)}`} className="text-2xl font-bold mt-6 mb-4 text-gray-900 border-b-2 border-blue-200 pb-2">{line.substring(3)}</h2>;
      } else if (line.startsWith('# ')) {
        return <h1 key={`h1-${index}-${line.substring(0, 10)}`} className="text-3xl font-bold mt-6 mb-4 text-gray-900 border-b-2 border-blue-300 pb-3">{line.substring(2)}</h1>;
      }
      
      // Handle quotes
      if (line.startsWith('> ')) {
        return <blockquote key={`quote-${index}-${line.substring(0, 10)}`} className="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-4 bg-gray-50 py-2 rounded-r">{line.substring(2)}</blockquote>;
      }
      
      // Handle lists
      if (line.startsWith('- ')) {
        return <li key={`li-${index}-${line.substring(0, 10)}`} className="ml-4 list-disc text-gray-700 mb-1">{line.substring(2)}</li>;
      } else if (/^\d+\. /.test(line)) {
        return <li key={`li-num-${index}-${line.substring(0, 10)}`} className="ml-4 list-decimal text-gray-700 mb-1">{line.replace(/^\d+\. /, '')}</li>;
      }
      
      // Handle inline formatting
      if (line.trim()) {
        formattedLine = formattedLine
          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900 font-bold">$1</strong>') // Bold
          .replace(/\*(.*?)\*/g, '<em class="text-gray-600 italic">$1</em>') // Italic
          .replace(/`(.*?)`/g, '<code class="bg-gray-200 text-gray-800 px-2 py-1 rounded text-sm font-mono border border-gray-300">$1</code>') // Code
          .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-800 hover:underline transition-colors" target="_blank" rel="noopener noreferrer">$1</a>'); // Links
        
        return <p key={`p-${index}-${line.substring(0, 10)}`} className="mb-4 text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: formattedLine }} />;
      }
      
      return <br key={`br-light-${index}`} />;
    });
    
    return formattedLines;
  };

  return <div>{formatContent(content)}</div>;
};
