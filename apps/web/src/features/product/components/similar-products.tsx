import { useQuery } from '@tanstack/react-query';

import { ProductCard, type ProductCardData } from '../../../components/product-card';
import { queryKeys } from '../../../lib/query-keys';
import { fetchSimilar } from '../product-api';

export function SimilarProducts({ productId }: { productId: string }) {
  const similar = useQuery({
    queryKey: queryKeys.similar(productId),
    queryFn: () => fetchSimilar(productId),
  });

  // A failed or empty recommendation block should not distract from the product itself.
  if (!similar.isSuccess || similar.data.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="similar-heading" className="space-y-3">
      <h2 id="similar-heading" className="text-lg font-semibold">
        Similar products
      </h2>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {similar.data.map((item) => {
          const card: ProductCardData = {
            id: item.id,
            type: item.type,
            title: item.title,
            imageUrl: item.image,
            priceCents: item.priceCents,
            inStock: item.inStock,
            ratingAverage: item.rating.average,
            ratingCount: item.rating.count,
          };
          return (
            <li key={item.id}>
              <ProductCard product={card} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
