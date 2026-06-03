import * as yaml from 'js-yaml';
import { loadProducts, parseProducts, thresholdToCents, Product } from './products';

describe('config/products.yaml schema', () => {
  let products: Product[];

  beforeAll(() => {
    products = loadProducts();
  });

  it('parses without error', () => {
    expect(products).toBeDefined();
  });

  it('has at least one product entry', () => {
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
  });

  describe('each product entry', () => {
    it('has a non-empty name string', () => {
      for (const p of products) {
        expect(typeof p.name).toBe('string');
        expect(p.name.length).toBeGreaterThan(0);
      }
    });

    it('has a 10-character uppercase alphanumeric asin', () => {
      for (const p of products) {
        expect(p.asin).toMatch(/^[A-Z0-9]{10}$/);
      }
    });

    it('has a positive alert_threshold_usd number', () => {
      for (const p of products) {
        expect(typeof p.alert_threshold_usd).toBe('number');
        expect(p.alert_threshold_usd).toBeGreaterThan(0);
      }
    });

    it('has a boolean enabled field', () => {
      for (const p of products) {
        expect(typeof p.enabled).toBe('boolean');
      }
    });

    it('disabled entries are structurally valid', () => {
      const disabled = products.filter(p => p.enabled === false);
      for (const p of disabled) {
        expect(typeof p.name).toBe('string');
        expect(typeof p.asin).toBe('string');
        expect(typeof p.alert_threshold_usd).toBe('number');
      }
    });
  });

  it('has no duplicate ASINs', () => {
    const asins = products.map(p => p.asin);
    expect(new Set(asins).size).toBe(asins.length);
  });
});

describe('parseProducts validation', () => {
  function makeYaml(products: unknown[]): string {
    return yaml.dump({ products });
  }

  it('rejects invalid ASIN format', () => {
    const input = makeYaml([
      { name: 'Test', asin: 'bad-asin', alert_threshold_usd: 9.99, enabled: true },
    ]);
    expect(() => parseProducts(input)).toThrow(/asin must match/);
  });

  it('rejects lowercase ASIN', () => {
    const input = makeYaml([
      { name: 'Test', asin: 'b001e4kfg0', alert_threshold_usd: 9.99, enabled: true },
    ]);
    expect(() => parseProducts(input)).toThrow(/asin must match/);
  });

  it('rejects duplicate ASINs', () => {
    const input = makeYaml([
      { name: 'A', asin: 'B001E4KFG0', alert_threshold_usd: 9.99, enabled: true },
      { name: 'B', asin: 'B001E4KFG0', alert_threshold_usd: 5.00, enabled: false },
    ]);
    expect(() => parseProducts(input)).toThrow(/Duplicate ASIN/);
  });

  it('rejects non-positive alert_threshold_usd', () => {
    const input = makeYaml([
      { name: 'Test', asin: 'B001E4KFG0', alert_threshold_usd: 0, enabled: true },
    ]);
    expect(() => parseProducts(input)).toThrow(/alert_threshold_usd must be a positive number/);
  });

  it('rejects non-boolean enabled', () => {
    const input = makeYaml([
      { name: 'Test', asin: 'B001E4KFG0', alert_threshold_usd: 9.99, enabled: 'yes' },
    ]);
    expect(() => parseProducts(input)).toThrow(/enabled must be a boolean/);
  });

  it('rejects empty products array', () => {
    expect(() => parseProducts(yaml.dump({ products: [] }))).toThrow(/at least one product/);
  });
});

describe('thresholdToCents', () => {
  it('converts 18.99 to 1899 without IEEE 754 truncation', () => {
    // 18.99 * 100 = 1898.9999999999998 in IEEE 754; Math.round corrects this
    expect(thresholdToCents(18.99)).toBe(1899);
  });

  it('converts 6.99 to 699', () => {
    expect(thresholdToCents(6.99)).toBe(699);
  });

  it('converts 14.99 to 1499', () => {
    expect(thresholdToCents(14.99)).toBe(1499);
  });
});
