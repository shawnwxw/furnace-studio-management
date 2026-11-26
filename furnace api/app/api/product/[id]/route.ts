import { deleteProduct, updateProduct } from '../productController';

export const runtime = 'nodejs';

// Updates the named product and optionally replaces its picture.
export async function PATCH(request: Request, context: RouteContext<'/api/product/[id]'>) {
  const { id } = await context.params;
  return updateProduct(id, request);
}

// Removes the selected product and its stored picture.
export async function DELETE(_request: Request, context: RouteContext<'/api/product/[id]'>) {
  const { id } = await context.params;
  return deleteProduct(id);
}
