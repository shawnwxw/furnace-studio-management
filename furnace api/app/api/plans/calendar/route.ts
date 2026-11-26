// Maps Calendar reads, revision-checked replacements, and legacy imports to this route.
export { getPlans as GET, putPlans as PUT, importPlans as POST } from '../calendarController';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
