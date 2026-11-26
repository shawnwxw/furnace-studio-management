import { useEffect, useRef, useState } from 'react';
import { usePopups } from '../../../common/Popup/PopupProvider';
import type { TaskSnapshot } from '../../../interface/task';

// Animate server-confirmed completions before the updated list moves them to history.
export function useTaskCompletion() {
  const { showMessage } = usePopups();
  const [taskMotion, setTaskMotion] = useState(new Map<string, 'leaving' | 'checking'>());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function animateCompletion(previous: TaskSnapshot, saved: TaskSnapshot, history = false) {
    if (!mounted.current) return;
    const previousById = new Map(previous.items.map(item => [item.id, item]));
    const newlyCompleted = saved.items.filter(item => item.completed && !previousById.get(item.id)?.completed);
    const finishedRoots = new Set(newlyCompleted.filter(item => !item.parentTaskId).map(item => item.id));

    if (!history && newlyCompleted.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const motion = new Map<string, 'leaving' | 'checking'>();
      for (const item of newlyCompleted) motion.set(item.id, 'checking');
      for (const item of saved.items) {
        if (finishedRoots.has(item.parentTaskId ?? item.id)) motion.set(item.id, 'leaving');
      }
      setTaskMotion(motion);
      // Keep the old rows mounted for the duration of the slide-out.
      await new Promise<void>(resolve => window.setTimeout(resolve, 240));
      if (!mounted.current) return;
      setTaskMotion(new Map());
    }

    for (const item of newlyCompleted) {
      if (item.isMainTask) {
        showMessage({
          title: 'Main task completed',
          message: `All subtasks for “${item.name}” are complete. You can find it in Task history.`,
        });
      }
    }
  }

  return { animateCompletion, taskMotion };
}
