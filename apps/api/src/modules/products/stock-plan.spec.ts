import { planStockDeduction } from './stock-plan';

describe('planStockDeduction', () => {
  it('sorts by product id so rows are always locked in the same order', () => {
    const plan = planStockDeduction([
      { productId: 'c', quantity: 1 },
      { productId: 'a', quantity: 2 },
      { productId: 'b', quantity: 3 },
    ]);

    expect(plan.deductions.map((item) => item.productId)).toEqual(['a', 'b', 'c']);
  });

  it('merges duplicate products', () => {
    const plan = planStockDeduction([
      { productId: 'a', quantity: 2 },
      { productId: 'b', quantity: 1 },
      { productId: 'a', quantity: 3 },
    ]);

    expect(plan.deductions).toEqual([
      { productId: 'a', quantity: 5 },
      { productId: 'b', quantity: 1 },
    ]);
  });

  it('reports every product the snapshot cannot cover, not just the first', () => {
    const plan = planStockDeduction(
      [
        { productId: 'a', quantity: 5 },
        { productId: 'b', quantity: 1 },
        { productId: 'c', quantity: 2 },
        { productId: 'd', quantity: 1 },
      ],
      new Map([
        ['a', 4],
        ['b', 1],
        ['c', 0],
      ]),
    );

    expect(plan.shortages).toEqual([
      { productId: 'a', requested: 5, available: 4 },
      { productId: 'c', requested: 2, available: 0 },
      { productId: 'd', requested: 1, available: 0 },
    ]);
  });

  it('checks merged quantities against the snapshot', () => {
    const plan = planStockDeduction(
      [
        { productId: 'a', quantity: 3 },
        { productId: 'a', quantity: 3 },
      ],
      new Map([['a', 5]]),
    );

    expect(plan.shortages).toEqual([{ productId: 'a', requested: 6, available: 5 }]);
  });

  it('has no shortages without a snapshot', () => {
    expect(planStockDeduction([{ productId: 'a', quantity: 1 }]).shortages).toEqual([]);
  });
});
