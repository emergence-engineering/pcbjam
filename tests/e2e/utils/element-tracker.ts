import { Page } from '@playwright/test';

export interface WxElement {
  id: string;
  label: string;
  name: string;
  typeName: string;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  parentId: string | null;
  visible: boolean;
  enabled: boolean;
  lastUpdated: number;
}

export interface FindOptions {
  visible?: boolean;
  enabled?: boolean;
  exact?: boolean;
  type?: string;
  parent?: string;
}

export interface FindFilter extends FindOptions {
  label?: string;
  name?: string;
}

export interface RegistryStats {
  total: number;
  byType: Record<string, number>;
}

export interface WxElementRegistry {
  elements: Map<string, WxElement>;
  version: number;
  register(id: string, info: WxElement): void;
  update(id: string, updates: Partial<WxElement>): void;
  unregister(id: string): void;
  findByLabel(label: string, options?: FindOptions): WxElement[];
  findByName(name: string, options?: FindOptions): WxElement[];
  findByType(typeName: string, options?: FindOptions): WxElement[];
  findAll(filter?: FindFilter): WxElement[];
  getElement(id: string): WxElement | null;
  dump(): void;
  getStats(): RegistryStats;
}

declare global {
  interface Window {
    wxElementRegistry?: WxElementRegistry;
  }
}

/**
 * Wait for element registry to be available
 */
export async function waitForRegistry(page: Page, timeout = 5000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => typeof window.wxElementRegistry !== 'undefined',
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Find element by label text
 */
export async function findByLabel(
  page: Page,
  label: string,
  options: FindOptions = {}
): Promise<WxElement | null> {
  const elements = await page.evaluate(
    ([label, opts]: [string, FindOptions]) => {
      const registry = window.wxElementRegistry;
      if (!registry) return [];
      return registry.findByLabel(label, opts);
    },
    [label, options] as [string, FindOptions]
  );
  return elements.length > 0 ? elements[0] : null;
}

/**
 * Find all elements by label text
 */
export async function findAllByLabel(
  page: Page,
  label: string,
  options: FindOptions = {}
): Promise<WxElement[]> {
  return page.evaluate(
    ([label, opts]: [string, FindOptions]) => {
      const registry = window.wxElementRegistry;
      if (!registry) return [];
      return registry.findByLabel(label, opts);
    },
    [label, options] as [string, FindOptions]
  );
}

/**
 * Find element by name
 */
export async function findByName(
  page: Page,
  name: string,
  options: FindOptions = {}
): Promise<WxElement | null> {
  const elements = await page.evaluate(
    ([name, opts]: [string, FindOptions]) => {
      const registry = window.wxElementRegistry;
      if (!registry) return [];
      return registry.findByName(name, opts);
    },
    [name, options] as [string, FindOptions]
  );
  return elements.length > 0 ? elements[0] : null;
}

/**
 * Find elements by type name (e.g., "wxButton", "wxTextCtrl")
 */
export async function findByType(
  page: Page,
  typeName: string,
  options: FindOptions = {}
): Promise<WxElement[]> {
  return page.evaluate(
    ([typeName, opts]: [string, FindOptions]) => {
      const registry = window.wxElementRegistry;
      if (!registry) return [];
      return registry.findByType(typeName, opts);
    },
    [typeName, options] as [string, FindOptions]
  );
}

/**
 * Find all elements matching filter
 */
export async function findAll(
  page: Page,
  filter: FindFilter = {}
): Promise<WxElement[]> {
  return page.evaluate(
    (filter: FindFilter) => {
      const registry = window.wxElementRegistry;
      if (!registry) return [];
      return registry.findAll(filter);
    },
    filter
  );
}

/**
 * Click on an element by label
 */
export async function clickByLabel(
  page: Page,
  label: string,
  options: FindOptions = {}
): Promise<boolean> {
  const element = await findByLabel(page, label, options);
  if (!element) {
    console.warn(`Element with label "${label}" not found`);
    return false;
  }

  await page.mouse.click(element.centerX, element.centerY);
  return true;
}

/**
 * Click on an element by name
 */
export async function clickByName(
  page: Page,
  name: string,
  options: FindOptions = {}
): Promise<boolean> {
  const element = await findByName(page, name, options);
  if (!element) {
    console.warn(`Element with name "${name}" not found`);
    return false;
  }

  await page.mouse.click(element.centerX, element.centerY);
  return true;
}

/**
 * Get element position for manual clicking (returns screen coords)
 */
export async function getElementPosition(
  page: Page,
  labelOrName: string,
  options: FindOptions = {}
): Promise<{ x: number; y: number } | null> {
  // Try label first, then name
  let element = await findByLabel(page, labelOrName, options);
  if (!element) {
    element = await findByName(page, labelOrName, options);
  }
  if (!element) return null;

  return { x: element.centerX, y: element.centerY };
}

/**
 * Dump all elements to console (for debugging)
 */
export async function dumpElements(page: Page): Promise<void> {
  await page.evaluate(() => {
    const registry = window.wxElementRegistry;
    if (registry) {
      registry.dump();
    } else {
      console.log('[wxElementRegistry] Not initialized');
    }
  });
}

/**
 * Get registry statistics
 */
export async function getRegistryStats(page: Page): Promise<RegistryStats | null> {
  return page.evaluate(() => {
    const registry = window.wxElementRegistry;
    if (!registry) return null;
    return registry.getStats();
  });
}

/**
 * Wait for an element to appear by label
 */
export async function waitForElement(
  page: Page,
  label: string,
  options: FindOptions & { timeout?: number } = {}
): Promise<WxElement | null> {
  const timeout = options.timeout || 5000;
  const { timeout: _, ...findOptions } = options;

  try {
    await page.waitForFunction(
      ([label, opts]: [string, FindOptions]) => {
        const registry = window.wxElementRegistry;
        if (!registry) return false;
        const elements = registry.findByLabel(label, opts);
        return elements.length > 0;
      },
      [label, findOptions] as [string, FindOptions],
      { timeout }
    );
    return findByLabel(page, label, findOptions);
  } catch {
    return null;
  }
}
