import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Mermaid from './Mermaid';

interface MarkdownProps {
  content: string;
  variant?: 'chat' | 'document';
  className?: string;
}

export function Markdown({ content, variant = 'chat', className = '' }: MarkdownProps) {
  const isDoc = variant === 'document';

  return (
    <div className={`${className} ${isDoc ? 'w-full' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children, ...props }) => (
            <h1
              className={
                isDoc
                  ? 'mt-2 mb-6 border-b border-slate-200 pb-2 text-3xl font-black tracking-tight text-slate-900'
                  : 'mt-2 mb-2 border-b border-slate-200 pb-1 text-lg font-bold'
              }
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              className={
                isDoc
                  ? 'mt-8 mb-4 border-b border-slate-100 pb-1 text-2xl font-bold tracking-tight text-slate-800'
                  : 'mt-3 mb-2 text-base font-bold'
              }
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3
              className={
                isDoc ? 'mt-6 mb-3 text-xl font-bold text-slate-800' : 'mt-2 mb-1 text-sm font-bold'
              }
              {...props}
            >
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4
              className={
                isDoc
                  ? 'mt-4 mb-2 text-lg font-semibold text-slate-700'
                  : 'mt-1 mb-1 text-xs font-bold text-slate-500 uppercase'
              }
              {...props}
            >
              {children}
            </h4>
          ),

          // Text & Lists
          p: ({ children, ...props }) => (
            <p
              className={isDoc ? 'mb-4 leading-7 text-slate-700' : 'mb-2 leading-relaxed last:mb-0'}
              {...props}
            >
              {children}
            </p>
          ),
          ul: ({ children, ...props }) => (
            <ul
              className={
                isDoc ? 'mb-4 list-disc space-y-1 pl-6 text-slate-700' : 'mb-2 list-disc pl-4'
              }
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol
              className={
                isDoc ? 'mb-4 list-decimal space-y-1 pl-6 text-slate-700' : 'mb-2 list-decimal pl-4'
              }
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className={isDoc ? 'pl-1' : ''} {...props}>
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              className={
                isDoc
                  ? 'my-4 border-l-4 border-indigo-500 bg-slate-50 py-2 pr-2 pl-4 text-slate-600 italic'
                  : 'my-2 border-l-2 border-slate-300 pl-2 text-slate-500 italic'
              }
              {...props}
            >
              {children}
            </blockquote>
          ),
          a: ({ children, ...props }) => (
            <a
              className={
                isDoc
                  ? 'font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-800'
                  : 'text-indigo-600 hover:underline'
              }
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          hr: ({ ...props }) => (
            <hr className={isDoc ? 'my-8 border-slate-200' : 'my-4 border-slate-100'} {...props} />
          ),

          // Tables
          table: ({ children, ...props }) => (
            <div className="my-4 overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-slate-50" {...props}>
              {children}
            </thead>
          ),
          tbody: ({ children, ...props }) => (
            <tbody className="divide-y divide-slate-100 bg-white" {...props}>
              {children}
            </tbody>
          ),
          tr: ({ children, ...props }) => (
            <tr className="transition-colors hover:bg-slate-50/50" {...props}>
              {children}
            </tr>
          ),
          th: ({ children, ...props }) => (
            <th
              className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-slate-500 uppercase"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="px-4 py-3 text-sm text-slate-600" {...props}>
              {children}
            </td>
          ),

          // Code
          code({
            inline,
            className,
            children,
            ...props
          }: {
            inline?: boolean;
            className?: string;
            children?: React.ReactNode;
          }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';

            if (!inline && language === 'mermaid') {
              return <Mermaid chart={String(children).replace(/\n$/, '')} />;
            }

            return !inline && match ? (
              <SyntaxHighlighter
                style={vscDarkPlus as Record<string, React.CSSProperties>}
                language={language}
                PreTag="div"
                className="my-4 rounded-lg shadow-sm"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code
                className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm text-pink-600"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
