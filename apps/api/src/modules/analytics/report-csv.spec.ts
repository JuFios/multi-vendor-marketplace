import { CSV_HEADER, reportToCsv, type ReportData } from './report-csv';

const store = {
  sellerId: 'seller-1',
  storeName: '=EVIL()',
  ordersCount: 2,
  itemsCount: 3,
  grossCents: 13_000,
  refundedCents: 3_000,
  revenueCents: 10_000,
  commissionCents: 1_000,
  netCents: 9_000,
};
const product = {
  productId: 'product-1',
  title: 'Lamp, "desk"',
  quantity: 2,
  grossCents: 10_000,
  refundedCents: 0,
  revenueCents: 10_000,
};
const report: ReportData = {
  summary: {
    platformRevenueCents: 1_000,
    grossSalesCents: 13_000,
    refundsCents: 3_000,
    ordersCount: 2,
    revenueBySeller: [store],
    topSellers: [store],
    topProducts: [product],
    conversion: { cartsWithItems: 3, convertedCarts: 1, rate: 0.3333 },
  },
  daily: [
    { date: '2026-03-01', grossCents: 0, commissionCents: 0, ordersCount: 0 },
    { date: '2026-03-02', grossCents: 13_000, commissionCents: 1_000, ordersCount: 2 },
  ],
  products: [product],
};

describe('reportToCsv', () => {
  const lines = reportToCsv(report).split('\r\n');

  it('starts with the long-format header', () => {
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines[0]).toBe('section,date,entity_type,entity_id,entity_name,metric,value');
  });

  it('has one row per figure, every row with seven fields', () => {
    expect(lines).toContain('summary,,platform,,,platformRevenueCents,1000');
    expect(lines).toContain('summary,,platform,,,conversionRate,0.3333');
    expect(lines).toContain('daily,2026-03-02,platform,,,grossCents,13000');
    expect(lines).toContain('daily,2026-03-01,platform,,,ordersCount,0');
    expect(lines).toContain("top_sellers,,seller,seller-1,'=EVIL(),rank,1");
    expect(lines.filter((line) => line.startsWith('daily,'))).toHaveLength(6);
  });

  it('defuses and quotes text columns', () => {
    expect(lines).toContain("sellers,,seller,seller-1,'=EVIL(),netCents,9000");
    expect(lines).toContain('products,,product,product-1,"Lamp, ""desk""",quantity,2');
  });

  it('ends with a line break', () => {
    expect(lines.at(-1)).toBe('');
  });
});
