import { getProductArchive } from '../../productController';

export const runtime = 'nodejs';

// Reports the download size without sending any picture data.
export async function HEAD(_request: Request, context: RouteContext<'/api/product/[id]/archive'>) {
  const { id } = await context.params;
  return getProductArchive(id, 'head');
}

// Returns the archive size on request or downloads the pictures together.
export async function GET(request: Request, context: RouteContext<'/api/product/[id]/archive'>) {
  const { id } = await context.params;
  const sizeOnly = new URL(request.url).searchParams.get('size') === '1';
  return getProductArchive(id, sizeOnly ? 'metadata' : 'download');
}
