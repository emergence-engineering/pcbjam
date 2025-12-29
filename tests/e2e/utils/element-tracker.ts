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

export interface WxRenderedElement {
  id: string;
  parentId: string;
  elementType: 'tool' | 'menuitem' | 'sash' | 'auipart';
  subType: string;
  label: string;
  tooltip: string;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  enabled: boolean;
  index: number;
  lastUpdated: number;
}

export interface RenderedFindOptions {
  enabled?: boolean;
  elementType?: string;
  subType?: string;
  parentId?: string;
  exact?: boolean;
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
  // Rendered elements support
  renderedElements?: Map<string, WxRenderedElement>;
  renderedVersion?: number;
  findRenderedByLabel?(label: string, options?: RenderedFindOptions): WxRenderedElement[];
  findRenderedByType?(elementType: string, options?: RenderedFindOptions): WxRenderedElement[];
  findRenderedByParent?(parentId: string, options?: RenderedFindOptions): WxRenderedElement[];
  findAllRendered?(filter?: RenderedFindOptions & { label?: string }): WxRenderedElement[];
  dumpRendered?(): void;
  getRenderedStats?(): RegistryStats;
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

// ============================================================================
// Rendered Elements (toolbar tools, menu items, splitter sashes, AUI parts)
// ============================================================================

/**
 * Find rendered element by label (e.g., toolbar tool "New", menu item "File")
 */
export async function findRenderedByLabel(
  page: Page,
  label: string,
  options: RenderedFindOptions = {}
): Promise<WxRenderedElement | null> {
  const elements = await page.evaluate(
    ([label, opts]: [string, RenderedFindOptions]) => {
      const registry = window.wxElementRegistry;
      if (!registry || !registry.findRenderedByLabel) return [];
      return registry.findRenderedByLabel(label, opts);
    },
    [label, options] as [string, RenderedFindOptions]
  );
  return elements.length > 0 ? elements[0] : null;
}

/**
 * Find all rendered elements by label
 */
export async function findAllRenderedByLabel(
  page: Page,
  label: string,
  options: RenderedFindOptions = {}
): Promise<WxRenderedElement[]> {
  return page.evaluate(
    ([label, opts]: [string, RenderedFindOptions]) => {
      const registry = window.wxElementRegistry;
      if (!registry || !registry.findRenderedByLabel) return [];
      return registry.findRenderedByLabel(label, opts);
    },
    [label, options] as [string, RenderedFindOptions]
  );
}

/**
 * Find all rendered elements of a type (tool, menuitem, sash, auipart)
 */
export async function findRenderedByType(
  page: Page,
  elementType: string,
  options: RenderedFindOptions = {}
): Promise<WxRenderedElement[]> {
  return page.evaluate(
    ([type, opts]: [string, RenderedFindOptions]) => {
      const registry = window.wxElementRegistry;
      if (!registry || !registry.findRenderedByType) return [];
      return registry.findRenderedByType(type, opts);
    },
    [elementType, options] as [string, RenderedFindOptions]
  );
}

/**
 * Click on a toolbar tool by label or tooltip
 */
export async function clickToolbarTool(
  page: Page,
  label: string
): Promise<boolean> {
  const tool = await findRenderedByLabel(page, label, { elementType: 'tool' });
  if (!tool) {
    console.warn(`Toolbar tool "${label}" not found`);
    return false;
  }
  if (!tool.enabled) {
    console.warn(`Toolbar tool "${label}" is disabled`);
    return false;
  }
  await page.mouse.click(tool.centerX, tool.centerY);
  return true;
}

/**
 * Click on a menu bar item by label
 */
export async function clickMenuBarItem(
  page: Page,
  label: string
): Promise<boolean> {
  const menuItem = await findRenderedByLabel(page, label, {
    elementType: 'menuitem',
    subType: 'menubar'
  });
  if (!menuItem) {
    console.warn(`Menu bar item "${label}" not found`);
    return false;
  }
  if (!menuItem.enabled) {
    console.warn(`Menu bar item "${label}" is disabled`);
    return false;
  }
  await page.mouse.click(menuItem.centerX, menuItem.centerY);
  return true;
}

/**
 * Click on a popup menu item by label
 */
export async function clickMenuItem(
  page: Page,
  label: string
): Promise<boolean> {
  const menuItem = await findRenderedByLabel(page, label, {
    elementType: 'menuitem'
  });
  if (!menuItem) {
    console.warn(`Menu item "${label}" not found`);
    return false;
  }
  if (!menuItem.enabled) {
    console.warn(`Menu item "${label}" is disabled`);
    return false;
  }
  await page.mouse.click(menuItem.centerX, menuItem.centerY);
  return true;
}

/**
 * Get splitter sash element
 */
export async function getSplitterSash(
  page: Page,
  parentId?: string
): Promise<WxRenderedElement | null> {
  const options: RenderedFindOptions = {};
  if (parentId) options.parentId = parentId;

  const sashes = await findRenderedByType(page, 'sash', options);
  return sashes.length > 0 ? sashes[0] : null;
}

/**
 * Click on an AUI pane button (close, pin, maximize)
 */
export async function clickAuiButton(
  page: Page,
  buttonType: 'close' | 'pin' | 'maximize',
  paneCaption?: string
): Promise<boolean> {
  const options: RenderedFindOptions = {
    elementType: 'auipart',
    subType: buttonType
  };

  let button: WxRenderedElement | null = null;

  if (paneCaption) {
    // Find the specific pane first, then find the button by parent
    const caption = await findRenderedByLabel(page, paneCaption, {
      elementType: 'auipart',
      subType: 'caption'
    });
    if (caption) {
      // Button index is based on pane index
      const paneIndex = caption.index;
      const buttons = await findRenderedByType(page, 'auipart', { subType: buttonType });
      button = buttons.find(b => Math.floor(b.index / 10) === paneIndex) || null;
    }
  } else {
    // Just find the first button of this type
    const buttons = await findRenderedByType(page, 'auipart', options);
    button = buttons.length > 0 ? buttons[0] : null;
  }

  if (!button) {
    console.warn(`AUI ${buttonType} button not found`);
    return false;
  }

  await page.mouse.click(button.centerX, button.centerY);
  return true;
}

/**
 * Click on a rendered element by label (searches all types)
 */
export async function clickRenderedByLabel(
  page: Page,
  label: string,
  options: RenderedFindOptions = {}
): Promise<boolean> {
  const element = await findRenderedByLabel(page, label, options);
  if (!element) {
    console.warn(`Rendered element "${label}" not found`);
    return false;
  }
  if (!element.enabled) {
    console.warn(`Rendered element "${label}" is disabled`);
    return false;
  }
  await page.mouse.click(element.centerX, element.centerY);
  return true;
}

/**
 * Dump all rendered elements to console (for debugging)
 */
export async function dumpRenderedElements(page: Page): Promise<void> {
  await page.evaluate(() => {
    const registry = window.wxElementRegistry;
    if (registry && registry.dumpRendered) {
      registry.dumpRendered();
    } else {
      console.log('[wxElementRegistry] Rendered elements not available');
    }
  });
}

/**
 * Get rendered elements statistics
 */
export async function getRenderedStats(page: Page): Promise<RegistryStats | null> {
  return page.evaluate(() => {
    const registry = window.wxElementRegistry;
    if (!registry || !registry.getRenderedStats) return null;
    return registry.getRenderedStats();
  });
}
