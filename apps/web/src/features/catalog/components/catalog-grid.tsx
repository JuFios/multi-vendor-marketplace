import { ProductCard } from '../../../components/product-card';
import { Skeleton } from '../../../components/skeleton';
import type { CatalogItem } from '../catalog-api';
import { toCardData } from '../to-card-data';

export function CatalogGrid({ items }: { items: readonly CatalogItem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.id}>
          <ProductCard product={toCardData(item)} />
        </li>
      ))}
    </ul>
  );
}

export function CatalogGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-72" />
      ))}
    </div>
  );
}
