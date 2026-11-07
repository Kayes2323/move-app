/**
 * The MOVE Shop catalogue. ONE place for names, sizes and prices: the shop pages, the cart and the Firestore rules
 * (generated block in firestore.rules, checked by a test) all read these numbers.
 *
 * PRICES ARE SUGGESTED LAUNCH PRICES (BDT), set by Claude for the owner to confirm, from what was found:
 *  - sports tees in Bangladesh: about ৳350 to ৳990 on Bikroy classifieds (generic dri-fit); a branded, designed tee sits at the top;
 *  - an imported 500 ml electrolyte drink (Pocari Sweat) costs the equivalent of roughly ৳130-150 abroad; a local brand must be cheaper;
 *  - no current Bangladeshi retail price was found for running shoes or track pants; those are estimates for a local premium brand.
 * Change a price here, then run `npm test` (the rules test fails until firestore.rules is regenerated with `npm run shop:rules`).
 */
export type ProductCategory = "drink" | "apparel" | "shoes" | "set";

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  /** BDT, whole taka. */
  price: number;
  /** A crossed-out "before" price is only shown if this is a real earlier price. None yet. */
  tagline: string;
  details: string[];
  sizes: string[] | null;
  /** The owner's poster for it, under /public/images/shop/<id>.webp (missing until the posters are added). */
  image: string;
}

const APPAREL = ["S", "M", "L", "XL", "XXL"];

export const PRODUCTS: Product[] = [
  {
    id: "electrolyte-lemon",
    name: "MOVE Electrolyte Drink · Lemon",
    category: "drink",
    price: 90,
    tagline: "More than a drink. It's your next step.",
    details: ["500 ml", "Hydration + minerals + energy", "Natural lemon flavour, no added sugar"],
    sizes: null,
    image: "/images/shop/electrolyte-lemon.webp",
  },
  {
    id: "rehydrate-lemon",
    name: "MOVE Rehydrate · Lemon",
    category: "drink",
    price: 100,
    tagline: "Rehydrate. Move. Repeat.",
    details: ["500 ml", "Electrolytes for after the move", "Natural flavours, no added sugar"],
    sizes: null,
    image: "/images/shop/rehydrate-lemon.webp",
  },
  {
    id: "performance-tee",
    name: "MOVE Performance Tee",
    category: "apparel",
    price: 990,
    tagline: "More movement. Better you.",
    details: ["Ultra light, breathable fabric", "Quick-dry", "Green trim, MOVE print"],
    sizes: APPAREL,
    image: "/images/shop/performance-tee.webp",
  },
  {
    id: "training-pants",
    name: "MOVE Training Pants",
    category: "apparel",
    price: 1490,
    tagline: "Move freely. Feel better.",
    details: ["Adjustable waistband", "Zip pockets", "Tapered fit, ankle cuff", "4-way stretch"],
    sizes: APPAREL,
    image: "/images/shop/training-pants.webp",
  },
  {
    id: "track-pants",
    name: "MOVE Performance Track Pants",
    category: "apparel",
    price: 1690,
    tagline: "Move freely. Live actively.",
    details: ["Reflective detail for evening walks", "Secure zip pockets", "Breathable fabric"],
    sizes: APPAREL,
    image: "/images/shop/track-pants.webp",
  },
  {
    id: "running-shoes",
    name: "MOVE Performance Running Shoes",
    category: "shoes",
    price: 4490,
    tagline: "Built for every step.",
    details: ["Breathable mesh upper", "Energy-return sole", "Grip outsole for city roads"],
    sizes: ["39", "40", "41", "42", "43", "44", "45"],
    image: "/images/shop/running-shoes.webp",
  },
  {
    id: "activewear-set",
    name: "MOVE Activewear Set · Tee + Joggers",
    category: "set",
    price: 2290,
    tagline: "Built for your next move.",
    details: ["Performance tee and joggers", "Saves ৳190 on buying them apart", "Breathable, 4-way stretch"],
    sizes: APPAREL,
    image: "/images/shop/activewear-set.webp",
  },
];

export const productById = (id: string | null | undefined): Product | undefined => PRODUCTS.find((p) => p.id === id);

/** Delivery by courier, cash on delivery. Typical courier charges in Bangladesh; the owner should confirm with their courier. */
export const DELIVERY = { insideDhaka: 70, outsideDhaka: 130 } as const;
export const MAX_LINES = 6;
export const MAX_QTY = 10;
