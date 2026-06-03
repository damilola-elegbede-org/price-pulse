import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface Product {
  name: unknown;
  asin: unknown;
  keepa_product_id: unknown;
  alert_threshold_usd: unknown;
  enabled: unknown;
}

interface ProductsConfig {
  products: Product[];
}

const configPath = path.resolve(__dirname, '../../config/products.yaml');

function loadConfig(): ProductsConfig {
  const raw = fs.readFileSync(configPath, 'utf8');
  return yaml.load(raw) as ProductsConfig;
}

describe('config/products.yaml schema', () => {
  let config: ProductsConfig;

  beforeAll(() => {
    config = loadConfig();
  });

  it('parses without error', () => {
    expect(config).toBeDefined();
  });

  it('has at least one product entry', () => {
    expect(Array.isArray(config.products)).toBe(true);
    expect(config.products.length).toBeGreaterThan(0);
  });

  describe('each product entry', () => {
    it('has a non-empty name string', () => {
      for (const p of config.products) {
        expect(typeof p.name).toBe('string');
        expect((p.name as string).length).toBeGreaterThan(0);
      }
    });

    it('has a 10-character asin string', () => {
      for (const p of config.products) {
        expect(typeof p.asin).toBe('string');
        expect((p.asin as string).length).toBe(10);
      }
    });

    it('has a positive alert_threshold_usd number', () => {
      for (const p of config.products) {
        expect(typeof p.alert_threshold_usd).toBe('number');
        expect(p.alert_threshold_usd as number).toBeGreaterThan(0);
      }
    });

    it('has a boolean enabled field', () => {
      for (const p of config.products) {
        expect(typeof p.enabled).toBe('boolean');
      }
    });

    it('disabled entries are structurally valid', () => {
      const disabled = config.products.filter(p => p.enabled === false);
      for (const p of disabled) {
        expect(typeof p.name).toBe('string');
        expect(typeof p.asin).toBe('string');
        expect(typeof p.alert_threshold_usd).toBe('number');
      }
    });
  });
});
