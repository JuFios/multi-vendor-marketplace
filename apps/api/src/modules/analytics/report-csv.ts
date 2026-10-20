import { type CsvCell, toCsv } from './csv';

/** Bumped when the JSON report changes shape, so an importer can tell. */
export const REPORT_SCHEMA_VERSION = 1;

export const CSV_HEADER = [
  'section',
  'date',
  'entity_type',
  'entity_id',
  'entity_name',
  'metric',
  'value',
] as const;

interface StoreFigures {
  readonly sellerId: string;
  readonly storeName: string;
  readonly ordersCount: number;
  readonly itemsCount: number;
  readonly grossCents: number;
  readonly refundedCents: number;
  readonly revenueCents: number;
  readonly commissionCents: number;
  readonly netCents: number;
}

interface ProductFigures {
  readonly productId: string;
  readonly title: string;
  readonly quantity: number;
  readonly grossCents: number;
  readonly refundedCents: number;
  readonly revenueCents: number;
}

/** The parts of the report the CSV spells out. */
export interface ReportData {
  readonly summary: {
    readonly platformRevenueCents: number;
    readonly grossSalesCents: number;
    readonly refundsCents: number;
    readonly ordersCount: number;
    readonly revenueBySeller: readonly StoreFigures[];
    readonly topSellers: readonly StoreFigures[];
    readonly topProducts: readonly ProductFigures[];
    readonly conversion: {
      readonly cartsWithItems: number;
      readonly convertedCarts: number;
      readonly rate: number;
    };
  };
  readonly daily: readonly {
    readonly date: string;
    readonly grossCents: number;
    readonly commissionCents: number;
    readonly ordersCount: number;
  }[];
  readonly products: readonly ProductFigures[];
}

type Row = readonly CsvCell[];

const metrics = (
  section: string,
  date: string,
  entity: readonly [type: string, id: string, name: string],
  values: Readonly<Record<string, number>>,
): Row[] =>
  Object.entries(values).map(([metric, value]) => [section, date, ...entity, metric, value]);

const storeValues = (store: StoreFigures): Record<string, number> => ({
  ordersCount: store.ordersCount,
  itemsCount: store.itemsCount,
  grossCents: store.grossCents,
  refundedCents: store.refundedCents,
  revenueCents: store.revenueCents,
  commissionCents: store.commissionCents,
  netCents: store.netCents,
});

const productValues = (product: ProductFigures): Record<string, number> => ({
  quantity: product.quantity,
  grossCents: product.grossCents,
  refundedCents: product.refundedCents,
  revenueCents: product.revenueCents,
});

/** The "long" CSV of I-22: one row per figure, so every section fits one file. */
export function reportToCsv(report: ReportData): string {
  const { summary } = report;
  const platform = ['platform', '', ''] as const;
  const rows: Row[] = [
    [...CSV_HEADER],
    ...metrics('summary', '', platform, {
      platformRevenueCents: summary.platformRevenueCents,
      grossSalesCents: summary.grossSalesCents,
      refundsCents: summary.refundsCents,
      ordersCount: summary.ordersCount,
      cartsWithItems: summary.conversion.cartsWithItems,
      convertedCarts: summary.conversion.convertedCarts,
      conversionRate: summary.conversion.rate,
    }),
    ...report.daily.flatMap((day) =>
      metrics('daily', day.date, platform, {
        grossCents: day.grossCents,
        commissionCents: day.commissionCents,
        ordersCount: day.ordersCount,
      }),
    ),
    ...summary.revenueBySeller.flatMap((store) =>
      metrics('sellers', '', ['seller', store.sellerId, store.storeName], storeValues(store)),
    ),
    ...summary.topSellers.flatMap((store, index) =>
      metrics('top_sellers', '', ['seller', store.sellerId, store.storeName], {
        rank: index + 1,
        revenueCents: store.revenueCents,
      }),
    ),
    ...report.products.flatMap((product) =>
      metrics(
        'products',
        '',
        ['product', product.productId, product.title],
        productValues(product),
      ),
    ),
    ...summary.topProducts.flatMap((product, index) =>
      metrics('top_products', '', ['product', product.productId, product.title], {
        rank: index + 1,
        revenueCents: product.revenueCents,
      }),
    ),
  ];
  return toCsv(rows);
}
