import { clsx } from 'clsx';
import type { Persona } from '@/shared/types';
import type { LucideIcon } from 'lucide-react';
import styles from './PersonaCard.module.css';

interface PersonaCardProps {
  persona: Persona;
  label: string;
  sublabel: string;
  description: string;
  icon: LucideIcon;
  selected: boolean;
  onSelect: (p: Persona) => void;
}

export function PersonaCard({
  persona,
  label,
  sublabel,
  description,
  icon: Icon,
  selected,
  onSelect,
}: PersonaCardProps) {
  return (
    <button
      className={clsx(styles.card, selected && styles.selected)}
      onClick={() => onSelect(persona)}
      role="radio"
      aria-checked={selected}
      aria-label={`${label}: ${description}`}
      type="button"
    >
      <Icon size={14} className={styles.icon} aria-hidden />
      <span className={styles.title}>{label}</span>
      <span className={styles.sublabel}>· {sublabel}</span>
      <span className={styles.description}>{description}</span>
    </button>
  );
}
