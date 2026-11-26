import { jsonStore, revision, snapshot, storageError } from './planStorage';
import type { Schedule } from '../../interface/calendar';

// Validates the persisted schedule shape, including optional due dates and valid hue ranges.
function isSchedule(value: unknown): value is Schedule {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Schedule>;
  const date = /^\d{4,}-\d{2}-\d{2}$/;
  return typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.name === 'string' &&
    typeof item.startDate === 'string' && date.test(item.startDate) &&
    typeof item.dueDate === 'string' && (item.dueDate === '' || date.test(item.dueDate)) &&
    typeof item.note === 'string' && typeof item.color === 'number' &&
    item.color >= 0 && item.color < 360 && typeof item.completed === 'boolean';
}

const plans = jsonStore('plans.json', isSchedule);

// Returns the saved calendar schedules and their revision for the next write.
export async function getPlans() {
  try {
    return snapshot('schedules', await plans.read());
  } catch (error) {
    return storageError('plan', error);
  }
}

// Validates the payload and queues either an ID-based import or a revision-checked replacement.
async function updatePlans(request: Request, importing: boolean) {
  const incoming: unknown = await request.json().catch(() => null);
  if (!plans.isList(incoming)) {
    return Response.json({ error: 'Expected a list of schedules with unique IDs.' }, { status: 400 });
  }

  try {
    const result = await plans.update(current => {
      if (importing) {
        const ids = new Set(current.map(item => item.id));
        return [...current, ...incoming.filter(item => !ids.has(item.id))];
      }
      if (request.headers.get('If-Match') !== revision(current)) {
        return Response.json({ error: 'Plans have changed. Reload before saving.' }, { status: 412 });
      }
      return incoming;
    });
    return result instanceof Response ? result : snapshot('schedules', result);
  } catch (error) {
    return storageError('plan', error);
  }
}

// Replaces the full schedule list when the caller supplies the current revision.
export function putPlans(request: Request) {
  return updatePlans(request, false);
}

// Merge schedules from older frontend versions by ID.
// Imports browser schedules by ID and preserves the records already on the API.
export function importPlans(request: Request) {
  return updatePlans(request, true);
}
