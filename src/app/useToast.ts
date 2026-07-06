import { useCallback, useState } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);

    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.delete(id);
    }, 3000);
    timers.set(id, timer);

    return id;
  }, []);

  const remove = useCallback((id: string) => {
    const timer = timers.get(id);
    if (timer) { clearTimeout(timer); timers.delete(id); }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, add, remove };
}
