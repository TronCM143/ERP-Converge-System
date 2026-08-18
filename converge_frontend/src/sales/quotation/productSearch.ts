import { Product } from '../../inventory/ProductsPage';
import { formatProductName } from '../../shared/formatProductName';

/* Catalog search for the quotation product field.

   Replaces a native <datalist>, which could only ever match a product's NAME:
   the browser filters datalist options by their `value`, and the value has to
   be the text inserted on selection, so specs could never take part. Typing
   "8mp" or "night vision" therefore only matched products with those words in
   the name, even when dozens of products carried them in `specs`.

   Matching here is AND across whitespace-separated tokens, over every field
   that describes the product. "dahua 8mp" means dahua AND 8mp — narrowing as
   you type, which is what a search box is expected to do. OR would widen the
   list with every extra word. */

export interface ProductMatch {
  product: Product;
  /** Fields the query actually hit, for the "why did this match" hint. */
  hitFields: string[];
  score: number;
}

// `specs` is free text and can be long; the rest are short slugs.
function haystackFor(p: Product) {
  return {
    name: formatProductName(p.productName).toLowerCase(),
    brand: (p.brand ?? '').toLowerCase(),
    model: (p.model ?? '').toLowerCase(),
    category: (p.category ?? '').toLowerCase(),
    subcategory: (p.subcategory ?? '').toLowerCase(),
    specs: (p.specs ?? '').replace(/_/g, ' ').toLowerCase(),
    sku: (p.sku ?? '').toLowerCase()
  };
}

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Ranked catalog matches for a free-text query.
 *
 * Ranking exists so an exact name match doesn't get buried under spec matches:
 * a name hit outranks a brand/model hit, which outranks a specs hit. Within a
 * tier, shorter names win — they're the more specific product.
 */
export function searchProducts(products: Product[], query: string, limit = 30): ProductMatch[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const results: ProductMatch[] = [];

  for (const product of products) {
    const hay = haystackFor(product);
    const hitFields = new Set<string>();
    let score = 0;
    let matchedAll = true;

    for (const token of tokens) {
      let tokenScore = 0;

      // Weights are per-token, so a query hitting the name on one word and the
      // specs on another still ranks above one that only hits specs.
      if (hay.name.includes(token)) {
        tokenScore = 100;
        hitFields.add('name');
      } else if (hay.brand.includes(token)) {
        tokenScore = 60;
        hitFields.add('brand');
      } else if (hay.model.includes(token)) {
        tokenScore = 55;
        hitFields.add('model');
      } else if (hay.sku.includes(token)) {
        tokenScore = 50;
        hitFields.add('sku');
      } else if (hay.category.includes(token) || hay.subcategory.includes(token)) {
        tokenScore = 30;
        hitFields.add('category');
      } else if (hay.specs.includes(token)) {
        tokenScore = 25;
        hitFields.add('specs');
      }

      if (tokenScore === 0) {
        // AND semantics: one unmatched token disqualifies the product.
        matchedAll = false;
        break;
      }
      score += tokenScore;
    }

    if (!matchedAll) continue;

    // Whole-query hit on the name is the strongest possible signal.
    const full = tokens.join(' ');
    if (hay.name === full) score += 500;
    else if (hay.name.startsWith(full)) score += 200;

    results.push({ product, hitFields: [...hitFields], score });
  }

  return results
    .sort((a, b) => b.score - a.score || a.product.productName.length - b.product.productName.length)
    .slice(0, limit);
}

/**
 * A short slice of `specs` around the first matched token, so the dropdown can
 * show WHY a product matched when the hit wasn't in its name. Without this a
 * spec match looks arbitrary — the user sees a name that doesn't contain
 * anything they typed.
 */
export function specsSnippet(product: Product, query: string, maxLength = 90): string | null {
  const specs = (product.specs ?? '').replace(/_/g, ' ').trim();
  if (!specs) return null;

  const lower = specs.toLowerCase();
  const tokens = tokenizeQuery(query);
  const name = formatProductName(product.productName).toLowerCase();

  // Only worth showing for tokens the NAME doesn't already account for.
  const specToken = tokens.find((t) => !name.includes(t) && lower.includes(t));
  if (!specToken) return specs.length > maxLength ? `${specs.slice(0, maxLength)}…` : specs;

  const at = lower.indexOf(specToken);
  const start = Math.max(0, at - Math.floor((maxLength - specToken.length) / 2));
  const end = Math.min(specs.length, start + maxLength);

  return `${start > 0 ? '…' : ''}${specs.slice(start, end).trim()}${end < specs.length ? '…' : ''}`;
}
