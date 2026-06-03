import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface Product {
  name: string;
  asin: string;
  alert_threshold_usd: number;
  enabled: boolean;
}

const ASIN_RE = /^[A-Z0-9]{10}$/;

function validateProduct(p: unknown, index: number): Product {
  if (typeof p !== 'object' || p === null) {
    throw new Error(`products[${index}] is not an object`);
  }
  const r = p as Record<string, unknown>;
  if (typeof r.name !== 'string' || r.name.length === 0) {
    throw new Error(`products[${index}].name must be a non-empty string`);
  }
  if (typeof r.asin !== 'string' || !ASIN_RE.test(r.asin)) {
    throw new Error(`products[${index}].asin must match /^[A-Z0-9]{10}$/ (got: ${r.asin})`);
  }
  if (typeof r.alert_threshold_usd !== 'number' || r.alert_threshold_usd <= 0) {
    throw new Error(`products[${index}].alert_threshold_usd must be a positive number`);
  }
  if (typeof r.enabled !== 'boolean') {
    throw new Error(`products[${index}].enabled must be a boolean`);
  }
  return {
    name: r.name,
    asin: r.asin,
    alert_threshold_usd: r.alert_threshold_usd,
    enabled: r.enabled,
  };
}

export function parseProducts(yamlContent: string): Product[] {
  const parsed = yaml.load(yamlContent) as { products?: unknown[] } | null;
  if (!parsed || !Array.isArray(parsed.products)) {
    throw new Error('products.yaml must have a top-level "products" array');
  }
  if (parsed.products.length === 0) {
    throw new Error('products.yaml must contain at least one product');
  }

  const products = parsed.products.map((p, i) => validateProduct(p, i));

  const seen = new Set<string>();
  for (const p of products) {
    if (seen.has(p.asin)) {
      throw new Error(`Duplicate ASIN: ${p.asin}`);
    }
    seen.add(p.asin);
  }

  return products;
}

export function loadProducts(configPath?: string): Product[] {
  const filePath = configPath ?? path.resolve(__dirname, '../../config/products.yaml');
  return parseProducts(fs.readFileSync(filePath, 'utf8'));
}

// Use Math.round — Math.floor silently truncates (18.99 * 100 = 1898.999... in IEEE 754).
export function thresholdToCents(usd: number): number {
  return Math.round(usd * 100);
}
