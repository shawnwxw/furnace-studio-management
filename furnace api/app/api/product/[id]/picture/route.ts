import { getProductPicture } from '../../productController';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Resolves the route ID before reading the product picture.
export async function GET(request: Request, context: RouteContext<'/api/product/[id]/picture'>) {
  const { id } = await context.params;
  return getProductPicture(id, new URL(request.url).searchParams.get('download') === '1');
}
