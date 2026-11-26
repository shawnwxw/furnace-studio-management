// Exposes the product collection for listing, creating, and reordering products.
export { listProducts as GET, createProduct as POST, saveProductOrder as PUT } from './productController';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
