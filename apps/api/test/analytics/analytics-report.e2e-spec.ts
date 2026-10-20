import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { createSeller, createSellerOrder } from '../utils/factories';
import { resetState } from '../utils/reset-state';
import { createTestApp } from '../utils/test-app';

import { bookOrders } from './analytics-events';

interface ReportBody {
  schemaVersion: number;
  timeZone: string;
  summary: {
    from: string;
    to: string;
    grossSalesCents: number;
    platformRevenueCents: number;
    revenueBySeller: { storeName: string }[];
  };
  daily: { date: string; grossCents: number; ordersCount: number }[];
  products: { productId: string; title: string; revenueCents: number }[];
}

describe('Analytics report (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => resetState(prisma));

  afterAll(async () => {
    await resetState(prisma);
    await app.close();
  });

  const admin = () => bearerFor(app, { id: randomUUID(), roles: ['CUSTOMER', 'ADMIN'] });
  const report = async (query: string) =>
    request(app.getHttpServer())
      .get(`/api/admin/analytics/report${query}`)
      .set('Authorization', await admin())
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => done(null, text));
      });

  /** Two orders on 2 and 5 March; the first product has a title a spreadsheet would run. */
  const world = async () => {
    const store = await createSeller(prisma, { storeName: '=Evil, Store' });
    const first = await createSellerOrder(prisma, {
      sellerId: store.seller.id,
      quantity: 2,
      unitPriceCents: 5_000,
      createdAt: new Date('2026-03-02T10:00:00Z'),
    });
    const second = await createSellerOrder(prisma, {
      sellerId: store.seller.id,
      quantity: 1,
      unitPriceCents: 3_000,
      createdAt: new Date('2026-03-05T10:00:00Z'),
    });
    await prisma.product.update({
      where: { id: first.product.id },
      data: { title: '@Lamp "desk"' },
    });
    await bookOrders(app, [first, second]);
    return { store, first, second };
  };

  it('downloads the whole report as JSON', async () => {
    const { first, second } = await world();

    const response = await report('?from=2026-03-01&to=2026-03-07&format=json');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="analytics-report_2026-03-01_2026-03-07.json"',
    );
    const body = JSON.parse(response.body as string) as ReportBody;
    expect(body).toMatchObject({
      schemaVersion: 1,
      timeZone: 'Europe/Kyiv',
      summary: { from: '2026-03-01', to: '2026-03-07', grossSalesCents: 13_000 },
    });
    expect(body.daily).toHaveLength(7);
    expect(body.daily.find((day) => day.date === '2026-03-02')).toMatchObject({
      grossCents: 10_000,
      ordersCount: 1,
    });
    expect(body.daily.find((day) => day.date === '2026-03-03')).toMatchObject({
      grossCents: 0,
      ordersCount: 0,
    });
    expect(body.products.map((product) => product.productId)).toEqual([
      first.product.id,
      second.product.id,
    ]);
    expect(body.products[0]).toMatchObject({ title: '@Lamp "desk"', revenueCents: 10_000 });
  });

  it('defaults to JSON over the last 30 days', async () => {
    const response = await report('');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect((JSON.parse(response.body as string) as ReportBody).daily).toHaveLength(30);
  });

  it('downloads the same figures as a long-format CSV with formulas defused', async () => {
    const { store, first } = await world();

    const response = await report('?from=2026-03-01&to=2026-03-07&format=csv');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="analytics-report_2026-03-01_2026-03-07.csv"',
    );
    const lines = (response.body as string).split('\r\n');
    expect(lines[0]).toBe('section,date,entity_type,entity_id,entity_name,metric,value');
    expect(lines).toContain('summary,,platform,,,grossSalesCents,13000');
    expect(lines).toContain('summary,,platform,,,platformRevenueCents,1300');
    expect(lines).toContain('daily,2026-03-02,platform,,,grossCents,10000');
    expect(lines).toContain('daily,2026-03-04,platform,,,grossCents,0');
    expect(lines).toContain(
      `sellers,,seller,${store.seller.id},"'=Evil, Store",revenueCents,13000`,
    );
    expect(lines).toContain(
      `products,,product,${first.product.id},"'@Lamp ""desk""",revenueCents,10000`,
    );
    expect(lines.filter((line) => line.startsWith('daily,')).length).toBe(7 * 3);
    expect(lines.every((line) => line === '' || !/^[=+@-]/.test(line))).toBe(true);
  });

  it.each([
    ['an unknown format', '?format=xml'],
    ['a bad day', '?from=2026-13-01&format=csv'],
  ])('rejects %s', async (_label, query) => {
    expect((await report(query)).status).toBe(400);
  });

  it('is admin-only', async () => {
    const store = await createSeller(prisma);

    const unauthenticated = await request(app.getHttpServer()).get('/api/admin/analytics/report');
    const seller = await request(app.getHttpServer())
      .get('/api/admin/analytics/report')
      .set(
        'Authorization',
        await bearerFor(app, {
          id: store.user.id,
          roles: ['CUSTOMER', 'SELLER'],
          sellerId: store.seller.id,
        }),
      );

    expect(unauthenticated.status).toBe(401);
    expect(seller.status).toBe(403);
  });
});
