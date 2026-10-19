import { createsCycle } from './category';

describe('createsCycle', () => {
  const parents = new Map<string, string | null>([
    ['root', null],
    ['child', 'root'],
    ['grandchild', 'child'],
  ]);
  const parentOf = (id: string) => parents.get(id);

  it('detects a category made its own parent', () => {
    expect(createsCycle('child', 'child', parentOf)).toBe(true);
  });

  it('detects a category moved below one of its descendants', () => {
    expect(createsCycle('root', 'grandchild', parentOf)).toBe(true);
  });

  it('allows moving a category to an unrelated or higher parent', () => {
    expect(createsCycle('grandchild', 'root', parentOf)).toBe(false);
    expect(createsCycle('child', 'root', parentOf)).toBe(false);
  });
});
