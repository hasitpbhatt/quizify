import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.css';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn(styles.markdownContent, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img src={src} alt={alt} className={styles.image} loading="lazy" />
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className={styles.codeInline}>{children}</code>
            ) : (
              <pre className={styles.codeBlock}>
                <code className={styles.code}>{children}</code>
              </pre>
            );
          },
          strong: ({ children }) => <strong className={styles.strong}>{children}</strong>,
          em: ({ children }) => <em className={styles.em}>{children}</em>,
          ul: ({ children }) => <ul className={styles.ul}>{children}</ul>,
          ol: ({ children }) => <ol className={styles.ol}>{children}</ol>,
          li: ({ children }) => <li className={styles.li}>{children}</li>,
          p: ({ children }) => <p className={styles.p}>{children}</p>,
          blockquote: ({ children }) => (
            <blockquote className={styles.blockquote}>{children}</blockquote>
          ),
          h1: ({ children }) => <h1 className={styles.h1}>{children}</h1>,
          h2: ({ children }) => <h2 className={styles.h2}>{children}</h2>,
          h3: ({ children }) => <h3 className={styles.h3}>{children}</h3>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
