import { getGalleryPicture } from '../../../productController';

export const runtime = 'nodejs';

// Loads one image from the product's saved gallery.
export async function GET(_request: Request, context: RouteContext<'/api/product/[id]/picture/[pictureId]'>) {
  const { id, pictureId } = await context.params;
  return getGalleryPicture(id, pictureId);
}
