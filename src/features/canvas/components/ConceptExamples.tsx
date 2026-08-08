import styles from './ConceptExamples.module.css';
import { Markdown } from './Markdown';
import { cn } from '@/lib/utils';

interface ConceptExamplesProps {
  example: string;
  isVisible?: boolean;
  className?: string;
}

export function ConceptExamples({ example, isVisible = true, className }: ConceptExamplesProps) {
  if (!isVisible || !example || example === 'Loading...' || example === 'Generating...') {
    return null;
  }

  return (
    <div className={cn(styles.exampleContainer, className)}>
      <div className={styles.exampleHeader}>
        <span className={styles.exampleBadge}>💡 Example</span>
      </div>
      <div className={styles.exampleContent}>
        <Markdown>{example}</Markdown>
      </div>
    </div>
  );
}
