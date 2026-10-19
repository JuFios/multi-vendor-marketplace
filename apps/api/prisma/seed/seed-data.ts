export interface SeedCategory {
  slug: string;
  name: string;
  products: readonly string[];
}

export const CATEGORIES: readonly SeedCategory[] = [
  {
    slug: 'electronics',
    name: 'Electronics',
    products: [
      'Wireless Earbuds',
      'Mechanical Keyboard',
      'Portable Power Bank',
      '4K Action Camera',
      'Smart Fitness Band',
      'Bluetooth Speaker',
      'USB-C Docking Station',
    ],
  },
  {
    slug: 'fashion',
    name: 'Fashion',
    products: [
      'Classic Denim Jacket',
      'Leather Crossbody Bag',
      'Wool Winter Scarf',
      'Canvas Sneakers',
      'Cotton Oxford Shirt',
      'Aviator Sunglasses',
      'Merino Knit Beanie',
    ],
  },
  {
    slug: 'home-garden',
    name: 'Home & Garden',
    products: [
      'Ceramic Plant Pot Set',
      'Cast Iron Skillet',
      'Linen Bed Sheets',
      'LED Desk Lamp',
      'Bamboo Cutting Board',
      'Stainless Steel Kettle',
      'Garden Pruning Shears',
    ],
  },
  {
    slug: 'books',
    name: 'Books',
    products: [
      'Learning TypeScript',
      'The Art of Cooking',
      'Introduction to Astronomy',
      'A History of Europe',
      'Mindful Productivity',
      'Beginner Watercolors',
      'Short Stories Anthology',
    ],
  },
  {
    slug: 'sports-outdoors',
    name: 'Sports & Outdoors',
    products: [
      'Trail Running Backpack',
      'Yoga Mat Pro',
      'Insulated Water Bottle',
      'Two-Person Camping Tent',
      'Adjustable Dumbbell Pair',
      'Cycling Helmet',
      'Trekking Poles',
    ],
  },
  {
    slug: 'collectibles',
    name: 'Collectibles',
    products: [
      'Vintage Postcard Bundle',
      'Enamel Pin Collection',
      'Retro Board Game',
      'Commemorative Coin',
      'Miniature Model Train',
      'Art Deco Poster Print',
      'Mineral Specimen Box',
    ],
  },
];

export interface SeedAuction {
  key: string;
  title: string;
  categorySlug: string;
  startPriceCents: number;
  bidStepCents: number;
  durationSec: number;
  /** Seconds from now until the round ends. */
  endsInSec: number;
  /** Bid amounts in cents, ascending; empty means no bids. */
  bidAmountsCents: readonly number[];
}

export const AUCTIONS: readonly SeedAuction[] = [
  {
    key: 'ending-soon',
    title: 'Vintage Film Camera',
    categorySlug: 'electronics',
    startPriceCents: 150_000,
    bidStepCents: 5_000,
    durationSec: 300,
    endsInSec: 300,
    bidAmountsCents: [],
  },
  {
    key: 'with-bids',
    title: 'Signed First Edition Novel',
    categorySlug: 'books',
    startPriceCents: 80_000,
    bidStepCents: 2_500,
    durationSec: 86_400,
    endsInSec: 6 * 3_600,
    bidAmountsCents: [80_000, 85_000, 92_500],
  },
  {
    key: 'limited-sneakers',
    title: 'Limited Edition Sneakers',
    categorySlug: 'fashion',
    startPriceCents: 400_000,
    bidStepCents: 10_000,
    durationSec: 86_400,
    endsInSec: 24 * 3_600,
    bidAmountsCents: [],
  },
  {
    key: 'pocket-watch',
    title: 'Antique Pocket Watch',
    categorySlug: 'collectibles',
    startPriceCents: 250_000,
    bidStepCents: 5_000,
    durationSec: 259_200,
    endsInSec: 72 * 3_600,
    bidAmountsCents: [],
  },
];

export interface SeedProductVariant {
  priceCents: number;
  stock: number;
  ratingCount: number;
  ratingSum: number;
}

/** Spread of prices, stock levels (some scarce: 1-3) and ratings, derived from the position. */
export function productVariant(index: number): SeedProductVariant {
  const base = 1_500 + ((index * 7_919) % 148_500);
  const priceCents = base - (base % 100) + 99;

  let stock = 5 + ((index * 3) % 40);
  if (index % 7 === 0) {
    stock = 1;
  } else if (index % 5 === 0) {
    stock = 2;
  } else if (index % 11 === 0) {
    stock = 3;
  }

  const ratingCount = (index * 3) % 9;
  const averageTenths = 30 + (index % 5) * 5;
  const ratingSum = Math.round((ratingCount * averageTenths) / 10);

  return { priceCents, stock, ratingCount, ratingSum };
}

export function ratingAverage(ratingSum: number, ratingCount: number): string {
  return ratingCount === 0 ? '0.00' : (ratingSum / ratingCount).toFixed(2);
}
