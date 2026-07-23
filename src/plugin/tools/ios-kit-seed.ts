/**
 * iOS Kit Seeder
 *
 * Bundles a small set of universal iOS chrome components — status bar,
 * home indicator, and a simplified keyboard — directly in the plugin source
 * so they ship inside the build (zero network dependency), unlike the
 * lazily-fetched 54-icon core set.
 *
 * Design: ONE master component per asset, created once per file on a
 * dedicated "_Flaude iOS Kit" page. Callers should NOT re-search the file by
 * name on every screen — `seedIosKit()` is idempotent and returns the master
 * component node IDs directly, so callers cache those IDs (e.g. from the
 * first call's response) and `createInstance()` straight from them.
 */

const IOS_KIT_PAGE_NAME = '_Flaude iOS Kit';

const STATUS_BAR_COMPONENT_NAME = 'ios-status-bar · Default';
const HOME_INDICATOR_COMPONENT_NAME = 'ios-home-indicator · Default';
const KEYBOARD_COMPONENT_NAME = 'ios-keyboard · Default';

// Bundled glyph SVGs (signal / wifi / battery) — inlined so
// build-figma-plugin bundles them into the shipped plugin, no fetch needed.
const SIGNAL_SVG = `<svg width="18" height="12" viewBox="0 0 18 12" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="8" width="3" height="4" rx="1" fill="#000000"/>
<rect x="5" y="6" width="3" height="6" rx="1" fill="#000000"/>
<rect x="10" y="3" width="3" height="9" rx="1" fill="#000000"/>
<rect x="15" y="0" width="3" height="12" rx="1" fill="#000000"/>
</svg>`;

const WIFI_SVG = `<svg width="17" height="12" viewBox="0 0 17 12" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M8.5 11C9.32843 11 10 10.3284 10 9.5C10 8.67157 9.32843 8 8.5 8C7.67157 8 7 8.67157 7 9.5C7 10.3284 7.67157 11 8.5 11Z" fill="#000000"/>
<path d="M4.5 7C5.9 5.6 7.1 5 8.5 5C9.9 5 11.1 5.6 12.5 7" stroke="#000000" stroke-width="1.6" stroke-linecap="round"/>
<path d="M1.5 4C3.5 2 5.9 1 8.5 1C11.1 1 13.5 2 15.5 4" stroke="#000000" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

const BATTERY_SVG = `<svg width="25" height="12" viewBox="0 0 25 12" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="0.75" y="0.75" width="21.5" height="10.5" rx="2.5" stroke="#000000" stroke-opacity="0.35" stroke-width="1"/>
<rect x="2" y="2" width="19" height="8" rx="1.5" fill="#000000"/>
<path d="M23.5 4V8C24.3284 7.65 24.8 6.9 24.8 6C24.8 5.1 24.3284 4.35 23.5 4Z" fill="#000000" fill-opacity="0.4"/>
</svg>`;

interface SeedResult {
  created: string[];
  alreadyPresent: string[];
  /** Existing components that failed their own bounds self-check and were
   * repopulated in place — every existing instance across the file updates
   * automatically since the component id is unchanged. Surfaced explicitly
   * (not folded into `created`) so callers/agents SEE that a previously-
   * broken shared asset just got fixed everywhere at once. */
  healed: string[];
  componentIds: {
    statusBar: string;
    homeIndicator: string;
    keyboard: string;
  };
}

function getOrCreateIosKitPage(): PageNode {
  const existing = figma.root.children.find(
    (p): p is PageNode => p.type === 'PAGE' && p.name === IOS_KIT_PAGE_NAME
  );
  if (existing) return existing;
  const page = figma.createPage();
  page.name = IOS_KIT_PAGE_NAME;
  return page;
}

async function findExistingComponent(name: string): Promise<ComponentNode | null> {
  // Dynamic-page documents (large files with many pages, like this one)
  // require all pages to be loaded before a root-wide findAllWithCriteria
  // scan is allowed — otherwise Figma throws "documentAccess: dynamic-page".
  await figma.loadAllPagesAsync();
  const matches = figma.root.findAllWithCriteria({ types: ['COMPONENT'] });
  return (matches.find((c) => c.name === name) as ComponentNode | undefined) ?? null;
}

/**
 * Self-check: every child (at any depth) of a freshly-built kit component
 * must fit within the component's own declared bounds.
 *
 * Root cause this catches: `figma.createFrame()` returns a node at Figma's
 * factory-default 100x100 size. The original `createStatusBarComponent`
 * appended real content to a `Glyphs` frame but only ever set
 * `counterAxisAlignItems` on it — never `counterAxisSizingMode` — so the
 * frame stayed FIXED at the untouched default height of 100 inside a 44px-
 * tall status bar. With `clipsContent = false` on the outer bar, that
 * produced no error and no visual symptom inside a plain node inspection;
 * it only became visible as icons floating outside the status bar in an
 * actual screenshot, on the Nth screen that used it, in production.
 *
 * This assertion converts that failure mode from "silent, discovered late
 * by a human eyeballing a screenshot" into "loud, thrown immediately inside
 * the same seed_ios_kit call that built the broken component" — the same
 * mechanical-verification principle as compare_to_reference and
 * structural-lint, applied to our OWN bundled/trusted output, not just
 * agent-authored figma_execute code.
 */
function assertChildrenWithinBounds(component: ComponentNode): void {
  const problems: string[] = [];
  const EPS = 0.5;

  function walk(node: SceneNode, offsetX: number, offsetY: number): void {
    const absX = offsetX + node.x;
    const absY = offsetY + node.y;
    if (
      absX < -EPS ||
      absY < -EPS ||
      absX + node.width > component.width + EPS ||
      absY + node.height > component.height + EPS
    ) {
      problems.push(
        `"${node.name}" (${Math.round(node.width)}x${Math.round(node.height)} at ${Math.round(absX)},${Math.round(absY)}) overflows the ${Math.round(component.width)}x${Math.round(component.height)} component bounds`
      );
    }
    if ('children' in node) {
      for (const child of node.children) walk(child, absX, absY);
    }
  }

  for (const child of component.children) walk(child, 0, 0);

  if (problems.length > 0) {
    throw new Error(
      `seed_ios_kit: "${component.name}" failed its own bounds self-check after being built — ${problems.join('; ')}. ` +
        `This is a sizing-mode bug in the builder function (e.g. a child frame that kept Figma's default 100x100 size instead of hugging its real content) — fix the builder, do not ship a component that fails its own geometry check.`
    );
  }
}

function clearChildren(component: ComponentNode): void {
  for (const child of [...component.children]) child.remove();
}

async function populateStatusBarComponent(component: ComponentNode): Promise<void> {
  component.layoutMode = 'HORIZONTAL';
  // BUG FIXED HERE: this was left 'AUTO' (hug), which sounds harmless but
  // means the WHOLE bar's own width shrinks to wrap only its content (time
  // text + glyph cluster) instead of staying a fixed-width bar — there is
  // no leftover space left for `primaryAxisAlignItems: SPACE_BETWEEN` to
  // distribute, so the time and the signal/wifi/battery cluster end up
  // bunched together near the left edge instead of pinned to opposite
  // sides. `resize()` below only takes effect with primaryAxisSizingMode
  // FIXED — with AUTO it's silently overridden back to the hugged size the
  // very next layout pass, the same "resize() no-ops" failure mode as the
  // button-hug-both-axes defect class, just on the container instead of a
  // button. 390 matches this file's dominant screen width; instances can
  // still be resized narrower/wider per screen since the axis is FIXED, not
  // locked — FIXED means "has an explicit width", not "can't be resized".
  component.primaryAxisSizingMode = 'FIXED';
  component.counterAxisSizingMode = 'FIXED';
  component.resize(390, 44);
  component.primaryAxisAlignItems = 'SPACE_BETWEEN';
  component.counterAxisAlignItems = 'CENTER';
  component.paddingLeft = 20;
  component.paddingRight = 16;
  component.paddingTop = 14;
  component.paddingBottom = 12;
  component.fills = [];
  component.clipsContent = false;

  const time = figma.createText();
  const fonts = ['SF Pro', 'Inter', 'Roboto'];
  let fontLoaded = false;
  for (const family of fonts) {
    try {
      await figma.loadFontAsync({ family, style: 'Semibold' });
      time.fontName = { family, style: 'Semibold' };
      fontLoaded = true;
      break;
    } catch {
      // try next
    }
  }
  if (!fontLoaded) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    time.fontName = { family: 'Inter', style: 'Regular' };
  }
  time.characters = '9:41';
  time.fontSize = 15;
  time.name = 'Time';
  component.appendChild(time);

  const glyphs = figma.createFrame();
  glyphs.name = 'Glyphs';
  glyphs.layoutMode = 'HORIZONTAL';
  // BUG FIXED HERE: `figma.createFrame()` starts at Figma's factory-default
  // 100x100. Without explicitly setting BOTH sizing modes to hug content,
  // the frame's height silently stayed at that default 100 forever (width
  // happened to shrink because HORIZONTAL layoutMode defaults its primary
  // axis to hug) — see assertChildrenWithinBounds's doc comment above for
  // how that actually manifested. Setting both axes to AUTO makes this
  // frame's size ALWAYS derive from its real icon content, never a leftover
  // factory default.
  glyphs.primaryAxisSizingMode = 'AUTO';
  glyphs.counterAxisSizingMode = 'AUTO';
  glyphs.itemSpacing = 5;
  glyphs.counterAxisAlignItems = 'CENTER';
  glyphs.fills = [];
  component.appendChild(glyphs);

  for (const [name, svg] of [
    ['Signal', SIGNAL_SVG],
    ['Wifi', WIFI_SVG],
    ['Battery', BATTERY_SVG],
  ] as const) {
    const node = figma.createNodeFromSvg(svg);
    node.name = name;
    glyphs.appendChild(node);
  }

  assertChildrenWithinBounds(component);
}

async function createStatusBarComponent(page: PageNode): Promise<ComponentNode> {
  const component = figma.createComponent();
  component.name = STATUS_BAR_COMPONENT_NAME;
  page.appendChild(component);
  await populateStatusBarComponent(component);
  return component;
}

function populateHomeIndicatorComponent(component: ComponentNode): void {
  component.resize(393, 34);
  component.fills = [];
  component.clipsContent = false;

  const pill = figma.createRectangle();
  pill.name = 'Pill';
  pill.resize(134, 5);
  pill.x = (393 - 134) / 2;
  pill.y = (34 - 5) / 2 - 4;
  pill.cornerRadius = 100;
  pill.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }];
  component.appendChild(pill);

  assertChildrenWithinBounds(component);
}

function createHomeIndicatorComponent(page: PageNode): ComponentNode {
  const component = figma.createComponent();
  component.name = HOME_INDICATOR_COMPONENT_NAME;
  page.appendChild(component);
  populateHomeIndicatorComponent(component);
  return component;
}

async function createKeyboardComponent(page: PageNode): Promise<ComponentNode> {
  const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  const keyWidth = 33;
  const keyHeight = 42;
  const keyGap = 6;
  const rowGap = 10;
  const width = 393;
  const height = 24 + rows.length * keyHeight + (rows.length - 1) * rowGap + 40;

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }).catch(() => {});

  const component = figma.createComponent();
  component.name = KEYBOARD_COMPONENT_NAME;
  component.resize(width, height);
  component.fills = [{ type: 'SOLID', color: { r: 0.82, g: 0.83, b: 0.85 } }];

  let y = 12;
  for (const [rowIndex, row] of rows.entries()) {
    const rowWidth = row.length * keyWidth + (row.length - 1) * keyGap;
    const startX = (width - rowWidth) / 2 + (rowIndex === rows.length - 1 ? keyWidth * 0.6 : 0);
    for (let i = 0; i < row.length; i++) {
      const key = figma.createFrame();
      key.name = `Key / ${row[i]}`;
      key.resize(keyWidth, keyHeight);
      key.x = startX + i * (keyWidth + keyGap);
      key.y = y;
      key.cornerRadius = 5;
      key.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      key.layoutMode = 'NONE';
      component.appendChild(key);

      const label = figma.createText();
      label.characters = row[i];
      label.fontSize = 20;
      label.fontName = { family: 'Inter', style: 'Regular' };
      label.textAlignHorizontal = 'CENTER';
      label.textAlignVertical = 'CENTER';
      label.resize(keyWidth, keyHeight);
      label.x = key.x;
      label.y = key.y;
      component.appendChild(label);
    }
    y += keyHeight + rowGap;
  }

  assertChildrenWithinBounds(component);
  page.appendChild(component);
  return component;
}

interface ExpectedShape {
  width: number;
  height: number;
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
}

/**
 * A hug-sized (AUTO) auto-layout frame is internally self-consistent \u2014
 * children always fit inside a container that grows to wrap them, so
 * `assertChildrenWithinBounds` alone can never catch "this hugged to the
 * wrong size instead of being a fixed-width bar" (the actual bug behind the
 * status bar rendering with everything bunched at the left instead of
 * spread via SPACE_BETWEEN). When `expected` is given, also fail health if
 * the live component's own dimensions/sizing-mode drifted from the
 * builder's current canonical shape \u2014 so a component built by an OLDER
 * version of this file's logic gets healed even when it isn't, technically,
 * overflowing anything.
 */
function isHealthy(component: ComponentNode, expected?: ExpectedShape): boolean {
  try {
    assertChildrenWithinBounds(component);
  } catch {
    return false;
  }
  if (expected) {
    if (Math.abs(component.width - expected.width) > 0.5) return false;
    if (Math.abs(component.height - expected.height) > 0.5) return false;
    if (
      expected.primaryAxisSizingMode &&
      'primaryAxisSizingMode' in component &&
      component.primaryAxisSizingMode !== expected.primaryAxisSizingMode
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Idempotently seeds the iOS-kit master components (status bar, home
 * indicator, keyboard) on the "_Flaude iOS Kit" page. Safe to call every
 * time a screen needs one of these — components already present are
 * returned as-is (`alreadyPresent`), never duplicated.
 *
 * Callers should createInstance() directly from the returned componentIds
 * rather than re-searching the file by name on every screen.
 *
 * Self-healing: an existing status bar is re-validated against
 * `assertChildrenWithinBounds` (not just found-by-name and trusted) every
 * call. A file that already has a BROKEN status bar from before this bounds
 * check existed — e.g. one whose Glyphs frame silently kept Figma's
 * factory-default 100x100 size — gets it repopulated in place (same
 * component id, so every existing instance across every screen in the file
 * updates automatically) instead of that defect being permanent for the
 * life of the file.
 */
export async function seedIosKit(): Promise<SeedResult> {
  const page = getOrCreateIosKitPage();

  const created: string[] = [];
  const alreadyPresent: string[] = [];
  const healed: string[] = [];

  let statusBar = await findExistingComponent(STATUS_BAR_COMPONENT_NAME);
  if (statusBar && isHealthy(statusBar, { width: 390, height: 44, primaryAxisSizingMode: 'FIXED' })) {
    alreadyPresent.push(STATUS_BAR_COMPONENT_NAME);
  } else if (statusBar) {
    clearChildren(statusBar);
    await populateStatusBarComponent(statusBar);
    healed.push(STATUS_BAR_COMPONENT_NAME);
  } else {
    statusBar = await createStatusBarComponent(page);
    created.push(STATUS_BAR_COMPONENT_NAME);
  }

  let homeIndicator = await findExistingComponent(HOME_INDICATOR_COMPONENT_NAME);
  if (homeIndicator && isHealthy(homeIndicator)) {
    alreadyPresent.push(HOME_INDICATOR_COMPONENT_NAME);
  } else if (homeIndicator) {
    clearChildren(homeIndicator);
    populateHomeIndicatorComponent(homeIndicator);
    healed.push(HOME_INDICATOR_COMPONENT_NAME);
  } else {
    homeIndicator = createHomeIndicatorComponent(page);
    created.push(HOME_INDICATOR_COMPONENT_NAME);
  }

  // The keyboard master is superseded by flaude.keyboard()'s bundled
  // JSON reconstruction (real Apple keyboard, not this simplified
  // placeholder) — only re-validated here, never rebuilt from this
  // simplified builder, so a stale/broken one doesn't block seeding the
  // other two assets.
  let keyboard = await findExistingComponent(KEYBOARD_COMPONENT_NAME);
  if (keyboard) {
    alreadyPresent.push(KEYBOARD_COMPONENT_NAME);
  } else {
    keyboard = await createKeyboardComponent(page);
    created.push(KEYBOARD_COMPONENT_NAME);
  }

  return {
    created,
    alreadyPresent,
    healed,
    componentIds: {
      statusBar: statusBar.id,
      homeIndicator: homeIndicator.id,
      keyboard: keyboard.id,
    },
  };
}
