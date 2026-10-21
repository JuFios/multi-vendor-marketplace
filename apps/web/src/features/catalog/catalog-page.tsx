import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { Checkbox } from '../../components/checkbox';
import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Input } from '../../components/input';
import { Pagination } from '../../components/pagination';
import { PriceRangeInput } from '../../components/price-range-input';
import { Select } from '../../components/select';
import { useDebouncedCallback } from '../../hooks/use-debounced-callback';
import { formatMoney } from '../../lib/money';
import { queryKeys } from '../../lib/query-keys';

import { fetchCatalog } from './catalog-api';
import {
  CATALOG_PAGE_SIZE,
  parseFilters,
  serializeFilters,
  type CatalogFilters,
  type CatalogSort,
} from './catalog-params';
import { CatalogGrid, CatalogGridSkeleton } from './components/catalog-grid';
import { FacetFilter } from './components/facet-filter';

const SORT_LABELS: Record<CatalogSort, string> = {
  relevance: 'Relevance',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating_desc: 'Top rated',
  newest: 'Newest',
};

const TYPE_LABELS = { FIXED_PRICE: 'Fixed price', AUCTION: 'Auction' } as const;

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseFilters(searchParams);
  const [term, setTerm] = useState(filters.q);
  const [priceMin, setPriceMin] = useState(filters.priceMin);
  const [priceMax, setPriceMax] = useState(filters.priceMax);

  // The header search box and browser navigation change the URL under us.
  const [synced, setSynced] = useState({
    q: filters.q,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
  });
  if (
    synced.q !== filters.q ||
    synced.priceMin !== filters.priceMin ||
    synced.priceMax !== filters.priceMax
  ) {
    setSynced({ q: filters.q, priceMin: filters.priceMin, priceMax: filters.priceMax });
    setTerm(filters.q);
    setPriceMin(filters.priceMin);
    setPriceMax(filters.priceMax);
  }

  const update = (patch: Partial<CatalogFilters>) => {
    setSearchParams((previous) => {
      const next = { ...parseFilters(previous), ...patch };
      return serializeFilters('page' in patch ? next : { ...next, page: 1 });
    });
  };
  const updateDebounced = useDebouncedCallback(update, 350);

  const catalog = useQuery({
    queryKey: queryKeys.catalog(filters),
    queryFn: () => fetchCatalog(filters),
    placeholderData: keepPreviousData,
  });
  const data = catalog.data;

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <aside className="space-y-5" aria-label="Filters">
        <FacetFilter
          title="Category"
          selected={filters.categoryId}
          options={(data?.facets.categories ?? []).map((facet) => ({
            value: facet.id,
            label: facet.name,
            count: facet.count,
          }))}
          onChange={(categoryId) => {
            update({ categoryId });
          }}
        />
        <FacetFilter
          title="Seller"
          selected={filters.sellerId}
          options={(data?.facets.sellers ?? []).map((facet) => ({
            value: facet.id,
            label: facet.name,
            count: facet.count,
          }))}
          onChange={(sellerId) => {
            update({ sellerId });
          }}
        />
        <FacetFilter
          title="Type"
          selected={filters.type}
          options={(data?.facets.types ?? []).map((facet) => ({
            value: facet.value,
            label: TYPE_LABELS[facet.value],
            count: facet.count,
          }))}
          onChange={(type) => {
            update({ type: type === 'FIXED_PRICE' || type === 'AUCTION' ? type : '' });
          }}
        />
        <div className="space-y-1">
          <Checkbox
            label={`In stock only (${data?.facets.inStock.find((facet) => facet.value)?.count ?? 0})`}
            checked={filters.inStock}
            onChange={(event) => {
              update({ inStock: event.target.checked });
            }}
          />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Price</h2>
          <PriceRangeInput
            min={priceMin}
            max={priceMax}
            onMinChange={(value) => {
              setPriceMin(value);
              updateDebounced({ priceMin: value });
            }}
            onMaxChange={(value) => {
              setPriceMax(value);
              updateDebounced({ priceMax: value });
            }}
          />
          {data?.priceRange != null && data.total > 0 ? (
            <p className="text-xs text-muted">
              Available: {formatMoney(data.priceRange.min)} – {formatMoney(data.priceRange.max)}
            </p>
          ) : null}
        </div>
        <Select
          label="Minimum rating"
          value={filters.ratingMin}
          onChange={(event) => {
            update({ ratingMin: event.target.value });
          }}
        >
          <option value="">Any rating</option>
          <option value="4">4 and up</option>
          <option value="3">3 and up</option>
          <option value="2">2 and up</option>
        </Select>
      </aside>

      <section className="space-y-4">
        {data?.degraded === true ? (
          <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-warn">
            Search is running in limited mode: filters and counts may be incomplete.
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Input
              label="Search"
              type="search"
              placeholder="What are you looking for?"
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                updateDebounced({ q: event.target.value });
              }}
            />
          </div>
          <Select
            label="Sort by"
            value={filters.sort}
            onChange={(event) => {
              update({ sort: event.target.value as CatalogSort });
            }}
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {catalog.isPending ? <CatalogGridSkeleton /> : null}
        {catalog.isError ? (
          <ErrorState
            message="Could not load the catalog."
            onRetry={() => void catalog.refetch()}
          />
        ) : null}
        {data?.items.length === 0 ? (
          <EmptyState title="No products found" detail="Try changing or clearing the filters." />
        ) : null}
        {data !== undefined && data.items.length > 0 ? (
          <>
            <CatalogGrid items={data.items} />
            <Pagination
              page={data.page}
              limit={CATALOG_PAGE_SIZE}
              total={data.total}
              onPageChange={(page) => {
                update({ page });
              }}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}
