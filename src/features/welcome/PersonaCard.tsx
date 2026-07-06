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

export function PersonaCard({ persona, label, sublabel, description, icon: Icon, selected, onSelect }: PersonaCardProps) {
  return (
    <button
      className={clsx(styles.card, selected && styles.selected)}
      onClick={() => onSelect(persona)}
      aria-pressed={selected}
      type="button"
    >
      <Icon size={24} className={styles.icon} />
      <div className={styles.title}>{label}</div>
      <div className={styles.sublabel}>{sublabel}</div>
      <div className={styles.description}>{description}</div>
    </button>
  );
}
