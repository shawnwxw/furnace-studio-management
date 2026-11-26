import type { ProjectProduct } from '../../../interface/financialReport';
import { jsonStore, revision } from '../../plans/planStorage';
import { readOrderedProducts } from '../../product/productController';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const assignments = jsonStore('current-project.json', (value): value is ProjectProduct => {
  if (!value || typeof value !== 'object' || !('id' in value)) return false;
  return typeof value.id === 'string' && /^[a-f0-9-]{36}$/.test(value.id);
});

// Resolve eligibility against current product settings and ignore removed products.
async function linkedProductIds() {
  const products = await readOrderedProducts();
  return new Set(products.filter(product => product.includeInRevenue).map(product => product.id));
}

function projectResponse(stored: ProjectProduct[], linked: Set<string>) {
  return Response.json({
    productIds: stored.map(item => item.id).filter(id => linked.has(id)),
    revision: revision(stored),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  try {
    const [stored, linked] = await Promise.all([assignments.read(), linkedProductIds()]);
    return projectResponse(stored, linked);
  } catch (error) {
    console.error('Could not load the current project:', error);
    return Response.json({ error: 'Could not load the current project.' }, { status: 500 });
  }
}

// Replace the selection only if the caller has the current revision and every product is eligible.
export async function PUT(request: Request) {
  const next: unknown = await request.json().catch(() => null);
  if (!assignments.isList(next)) return Response.json({ error: 'Invalid project products.' }, { status: 400 });
  try {
    const linked = await linkedProductIds();
    if (next.some(product => !linked.has(product.id))) {
      return Response.json({ error: 'Only products linked to Financial Report can be assigned.' }, { status: 400 });
    }
    const result = await assignments.update(current => request.headers.get('If-Match') === revision(current)
      ? next.map(({ id }) => ({ id }))
      : Response.json({ error: 'Project products changed. Reload before saving.' }, { status: 412 }));
    return result instanceof Response ? result : projectResponse(result, linked);
  } catch (error) {
    console.error('Could not save the current project:', error);
    return Response.json({ error: 'Could not save the current project.' }, { status: 500 });
  }
}
