import { useEffect, useState } from 'react';
import LoadingSpinner from '../../../../common/LoadingSpinner/LoadingSpinner';
import { dataService } from '../../../../dataService';
import type { ProductList, ProductRecord } from '../../../../interface/product';
import ProductDetailsDialog from '../../../Product/ProductDetailsDialog/ProductDetailsDialog';
import { productEndpoint, productPictureUrl, selectHomeProducts } from '../../../Product/productData';

// Displays the two products selected for Home in their saved order.
export default function HomeProductWidget() {
  const [data, setData] = useState<ProductList | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [viewProduct, setViewProduct] = useState<ProductRecord | null>(null);
  const products = data ? selectHomeProducts(data.products, data.homeProductIds) : [];

  useEffect(() => {
    const controller = new AbortController();
    dataService.get<ProductList>(productEndpoint, { signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="home-products panel-frame" aria-labelledby="home-products-title">
      <h2 id="home-products-title">Products</h2>
      {loadFailed && <p role="alert">Could not load products.</p>}
      {!data && !loadFailed && <LoadingSpinner label="Loading products…" />}
      {data && (products.length === 0
        ? <p>{data.products.length ? 'No products selected for Home.' : 'No products yet.'}</p>
        : (
        <ul className="home-product-list" aria-label="Products selected for Home" tabIndex={0}>
          {products.map(product => (
            <li key={product.id}>
              <button type="button" className="home-product-card" aria-haspopup="dialog"
                aria-label={`View ${product.name}, current stock ${product.stock.toLocaleString()}`}
                onClick={() => setViewProduct(product)}>
                <img src={productPictureUrl(product)} alt="" loading="lazy" />
                <span className="home-product-summary">
                  <strong className="home-product-name">{product.name}</strong>
                  <span className="product-stock home-product-stock">
                    Current stock <strong>{product.stock.toLocaleString()}</strong>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ))}
      <ProductDetailsDialog product={viewProduct} onClose={() => setViewProduct(null)} />
    </section>
  );
}
