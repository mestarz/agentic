import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  return (
    <ReactMarkdown 
      remarkPlugins={[remarkGfm]} 
      components={{ 
        code({node, inline, className, children, ...props}: any) { 
          const match = /language-(\w+)/.exec(className || ''); 
          return !inline && match ? ( 
            <SyntaxHighlighter 
              style={vscDarkPlus as any} 
              language={match[1]} 
              PreTag="div" 
              className="rounded-lg my-4" 
              {...props}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter> 
          ) : (
            <code className="bg-slate-200 text-pink-600 px-1 rounded mx-1 font-mono text-[12px]" {...props}>
              {children}
            </code>
          ); 
        } 
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
