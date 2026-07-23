/**
 * MCP Command Handler
 *
 * Routes commands from the MCP server to Figma Plugin API operations.
 * This is where the magic happens - external Claude can control Figma.
 */

import {
  getFileStructure,
  getSelection,
  getNodeDetails,
  searchNodes,
  getAllTextNodes,
  exportFramePreview,
  checkLayoutConsistency,
  importHTML,
  studyFrame,
  auditComponents,
  getTextConstraints,
  prepareToDesign,
  getDesignRules,
  createFrame,
  createText,
  createRectangle,
  duplicateNode,
  moveNode,
  modifyNode,
  resizeNode,
  updateText,
  deleteNode,
  groupNodes,
  createScreenFromState,
  validateAgainstSchema,
  anchorBelow,
  centerInParent,
  centerOnSibling,
  makeHugPillButton,
  verifyLayout,
} from '../tools/edit-tools';
import { seedIosKit } from '../tools/ios-kit-seed';
import { runStructuralLint } from '../tools/structural-lint';
import { flaudeHelpers, drainFailedIconLookups } from '../tools/flaude-helpers';
import {
  recordScreenshot,
  checkReferenceCaptured,
  checkPixelDiffMissing,
  recordComparisonMarker,
} from '../tools/reference-tracking';
import { recordFindings, summarizeLedger } from '../tools/error-ledger';

type CommandHandler = (params: Record<string, unknown>) => unknown | Promise<unknown>;

const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  // READ COMMANDS
  get_file_structure: () => getFileStructure(),
  get_selection: () => getSelection(),
  get_node_details: (params) => getNodeDetails(params.nodeId as string),
  search_nodes: (params) => searchNodes(
    params.pattern as string,
    params.nodeType as string | undefined
  ),

  // DEEP ANALYSIS COMMANDS
  get_all_text_nodes: (params) => getAllTextNodes({
    nodeId: params.nodeId as string,
  }),

  export_frame_preview: async (params) => exportFramePreview({
    nodeId: params.nodeId as string,
    scale: params.scale as number | undefined,
    format: params.format as 'PNG' | 'JPG' | 'SVG' | undefined,
  }),

  check_layout_consistency: (params) => checkLayoutConsistency({
    nodeId: params.nodeId as string,
  }),

  // HTML IMPORT COMMAND
  import_html: async (params) => importHTML({
    html: params.html as string,
    parentId: params.parentId as string | undefined,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    name: params.name as string | undefined,
  }),

  // DESIGN LEARNING COMMANDS
  study_frame: (params) => studyFrame({
    nodeId: params.nodeId as string,
  }),

  audit_components: (params) => auditComponents({
    pageId: params.pageId as string | undefined,
    includeInstances: params.includeInstances as boolean | undefined,
  }),

  get_text_constraints: (params) => getTextConstraints({
    nodeId: params.nodeId as string | undefined,
  }),

  prepare_to_design: (params) => prepareToDesign({
    referenceFrameId: params.referenceFrameId as string | undefined,
    pageId: params.pageId as string | undefined,
  }),

  get_design_rules: (params) => getDesignRules({
    targetParentId: params.targetParentId as string | undefined,
    operation: params.operation as 'create_frame' | 'create_text' | 'create_rectangle' | 'modify' | 'general' | undefined,
  }),

  // WRITE COMMANDS
  create_frame: async (params) => createFrame({
    name: params.name as string,
    parentId: params.parentId as string | undefined,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    width: params.width as number,
    height: params.height as number,
    fillColor: params.fillColor as { r: number; g: number; b: number } | undefined,
  }),

  create_text: async (params) => createText({
    content: params.content as string,
    parentId: params.parentId as string,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    fontSize: params.fontSize as number | undefined,
    fontFamily: params.fontFamily as string | undefined,
    fontStyle: params.fontStyle as string | undefined,
    fontWeight: params.fontWeight as string | undefined,
    width: params.width as number | undefined,
    textAutoResize: params.textAutoResize as 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'NONE' | 'TRUNCATE' | undefined,
    fillColor: params.fillColor as { r: number; g: number; b: number } | undefined,
  }),

  create_rectangle: (params) => createRectangle({
    parentId: params.parentId as string,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    width: params.width as number,
    height: params.height as number,
    cornerRadius: params.cornerRadius as number | undefined,
    fillColor: params.fillColor as { r: number; g: number; b: number } | undefined,
    copyFillsFrom: params.copyFillsFrom as string | undefined,
  }),

  duplicate_node: (params) => duplicateNode({
    nodeId: params.nodeId as string,
    newName: params.newName as string | undefined,
    offsetX: params.offsetX as number | undefined,
    offsetY: params.offsetY as number | undefined,
    targetParentId: params.targetParentId as string | undefined,
  }),

  move_node: (params) => moveNode({
    nodeId: params.nodeId as string,
    targetParentId: params.targetParentId as string,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
  }),

  modify_node: (params) => modifyNode({
    nodeId: params.nodeId as string,
    properties: params.properties as Record<string, unknown>,
  }),

  resize_node: (params) => resizeNode({
    nodeId: params.nodeId as string,
    width: params.width as number | undefined,
    height: params.height as number | undefined,
  }),

  update_text: async (params) => updateText({
    nodeId: params.nodeId as string,
    content: params.content as string | undefined,
    fontSize: params.fontSize as number | undefined,
    fontFamily: params.fontFamily as string | undefined,
    fontStyle: params.fontStyle as string | undefined,
    fontWeight: params.fontWeight as string | undefined,
    width: params.width as number | undefined,
    textAutoResize: params.textAutoResize as 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'NONE' | 'TRUNCATE' | undefined,
    fillColor: params.fillColor as { r: number; g: number; b: number } | undefined,
    preserveSingleLine: params.preserveSingleLine as boolean | undefined,
  }),

  delete_node: (params) => deleteNode({
    nodeId: params.nodeId as string,
  }),

  group_nodes: (params) => groupNodes({
    nodeIds: params.nodeIds as string[],
    groupName: params.groupName as string | undefined,
  }),

  // SCHEMA-AWARE COMMANDS
  create_screen_from_state: async (params) => createScreenFromState({
    stateName: params.stateName as string,
    screenType: params.screenType as string | undefined,
    baseFrameId: params.baseFrameId as string | undefined,
    position: params.position as { x?: number; y?: number } | undefined,
    stateContent: params.stateContent as {
      hero?: string;
      subtext?: string;
      tone?: string;
    } | undefined,
  }),

  // Deterministic layout tools — math in code, no screenshot eyeballing.
  anchor_below: (params) => anchorBelow({
    nodeId: params.nodeId as string,
    anchorId: params.anchorId as string,
    gap: params.gap as number | undefined,
    matchX: params.matchX as boolean | undefined,
  }),
  center_in_parent: (params) => centerInParent({
    nodeId: params.nodeId as string,
    axis: params.axis as 'horizontal' | 'vertical' | 'both' | undefined,
    containerId: params.containerId as string | undefined,
  }),
  center_on_sibling: (params) => centerOnSibling({
    nodeId: params.nodeId as string,
    siblingId: params.siblingId as string,
    axis: params.axis as 'horizontal' | 'vertical' | 'both' | undefined,
  }),
  make_hug_pill_button: (params) => makeHugPillButton({
    nodeId: params.nodeId as string,
    paddingX: params.paddingX as number | undefined,
    height: params.height as number | undefined,
    cornerRadius: params.cornerRadius as number | undefined,
  }),
  verify_layout: (params) => verifyLayout({
    assertions: params.assertions as Array<Record<string, unknown>>,
  }),

  validate_against_schema: (params) => validateAgainstSchema({
    schemaSection: params.schemaSection as string | undefined,
    expectedStates: params.expectedStates as string[] | undefined,
  }),

  // UTILITY COMMANDS
  zoom_to_node: async (params) => {
    // getNodeByIdAsync (not the sync getNodeById) is required for nodes on
    // pages that aren't currently loaded in dynamic-page documents.
    const node = await figma.getNodeByIdAsync(params.nodeId as string);
    if (node && 'x' in node) {
      figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
      return { success: true, nodeId: params.nodeId };
    }
    throw new Error(`Node not found: ${params.nodeId}`);
  },

  select_nodes: async (params) => {
    const nodeIds = params.nodeIds as string[];
    const nodes: SceneNode[] = [];

    for (const id of nodeIds) {
      const node = await figma.getNodeByIdAsync(id);
      if (node && 'x' in node) {
        nodes.push(node as SceneNode);
      }
    }

    figma.currentPage.selection = nodes;
    return { selected: nodes.length, nodeIds: nodes.map(n => n.id) };
  },

  get_current_page: () => ({
    id: figma.currentPage.id,
    name: figma.currentPage.name,
    childCount: figma.currentPage.children.length,
  }),

  set_current_page: async (params) => {
    const page = figma.root.children.find(p => p.id === params.pageId || p.name === params.pageName);
    if (page) {
      // setCurrentPageAsync (not the sync figma.currentPage assignment) is
      // required in dynamic-page documents.
      await figma.setCurrentPageAsync(page);
      return { success: true, pageId: page.id, pageName: page.name };
    }
    throw new Error(`Page not found: ${params.pageId || params.pageName}`);
  },

  // ──────────────────────────────────────────────────────────────────────
  // MCP "swiss army" commands — these match what the hosted MCP server's
  // figma_execute / figma_screenshot / figma_status / figma_navigate tools
  // send over the wire. Without these, the hosted MCP can call the plugin
  // but the plugin rejects the message as "Unknown command".
  // ──────────────────────────────────────────────────────────────────────

  // figma_execute: run arbitrary JS in the Figma plugin context with `figma` global.
  // Code is wrapped in an async IIFE so callers can use `await` and `return`.
  //
  // After the agent's code runs, we ALWAYS run a structural lint pass over
  // whatever page ended up current and attach findings as `_lint` on the
  // result — unconditionally, not something the agent has to remember to
  // ask for. This is the mechanical backstop for defects that prose rules
  // (ICON BOOTSTRAP, REFERENCE-MATCH MODE) documented but didn't prevent:
  // hand-drawn icons/iOS chrome, buttons that silently collapse because a
  // resize() call didn't match the auto-layout sizing mode, avatar
  // placeholders where the reference shows a real photo, and two buttons
  // accidentally wrapped into what reads as one toggle track.
  execute: async (params) => {
    const code = params.code as string;
    if (typeof code !== 'string' || !code.trim()) {
      throw new Error('execute requires a non-empty `code` string');
    }
    // Snapshot BEFORE running the code so the reference-capture check below
    // can tell which top-level nodes are newly created by THIS call.
    const beforePage = figma.currentPage;
    const beforeIds = new Set(beforePage.children.map((n) => n.id));

    let result: unknown;
    try {
      // `figma` is frozen/sealed by Figma's plugin sandbox — assigning
      // figma.flaude = ... throws "object is not extensible". Expose the
      // blessed helpers (icon/statusBar/homeIndicator/keyboard) as their own
      // top-level `flaude` parameter instead, so agent code calls
      // `flaude.icon(...)` rather than `figma.flaude.icon(...)`.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function('figma', 'flaude', `return (async () => { ${code} })()`);
      result = await fn(figma, flaudeHelpers);
    } catch (err) {
      // If flaude.* recorded a failed lookup on the way to this uncaught
      // throw, drain (don't leave it queued) — the raw error message below
      // already surfaces it maximally directly; leaving it queued would
      // misattribute it to whatever the NEXT successful call happens to be.
      drainFailedIconLookups();
      throw new Error(`execute failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Failed flaude.icon() lookups are drained (and reported) UNCONDITIONALLY
    // — even if the agent's own code wrapped the call in try/catch and kept
    // going. This is deliberately NOT gated behind isPlainObject/lint.length:
    // an icon that silently failed to place is a real defect that already
    // happened, not an advisory heuristic, and must survive regardless of
    // what shape the call happens to return.
    const failedIconLookups = drainFailedIconLookups();

    // Only merge lint findings into plain-object results (e.g. `return { id }`)
    // so array/string/number returns from read-only inspection calls keep their
    // exact original shape — `_lint` is purely additive, never a restructuring.
    const isPlainObject =
      result !== null && typeof result === 'object' && !Array.isArray(result);

    if (isPlainObject) {
      try {
        const page = figma.currentPage;
        const pageHasRefFrames = page.children.some((n) => n.name.startsWith('REF /'));
        const lint: unknown[] = runStructuralLint(page, pageHasRefFrames);
        if (page.id === beforePage.id) {
          lint.push(...checkReferenceCaptured(page, beforeIds));
        }
        for (const failure of failedIconLookups) {
          lint.push({ rule: 'swallowed-icon-lookup-failure', ...failure });
        }
        lint.push(...checkPixelDiffMissing(page));
        if (lint.length > 0) {
          // Persist to the durable error ledger (fire-and-forget) so recurring
          // defects can later be analyzed and turned into new checks — the
          // data layer of the auto-improvement loop. Never awaited: telemetry
          // must not slow or fail a design call.
          recordFindings(lint as Array<Record<string, unknown>>, page.name);
          return { ...(result as Record<string, unknown>), _lint: lint };
        }
      } catch {
        // Lint is advisory only — never let a lint failure mask the real result.
      }
    }

    return result === undefined ? null : result;
  },

  // figma_screenshot: export a node (or current selection) as a base64 PNG.
  screenshot: async (params) => {
    const scale = (params.scale as number) || 1;
    let node: SceneNode | null = null;
    if (params.nodeId) {
      // getNodeByIdAsync (not the sync getNodeById) is required for nodes on
      // pages that aren't currently loaded in dynamic-page documents.
      const found = await figma.getNodeByIdAsync(params.nodeId as string);
      if (found && 'exportAsync' in found) node = found as SceneNode;
    } else {
      const sel = figma.currentPage.selection[0];
      if (sel) node = sel;
    }
    if (!node) {
      throw new Error('No node to screenshot: pass nodeId or select a node in Figma');
    }
    recordScreenshot(node);
    // Set only by compare_to_reference (never by a plain figma_screenshot
    // call) — records that a real pixel diff happened for this (ref, built)
    // pair, so checkPixelDiffMissing can tell "looked at it" apart from
    // "actually diffed it".
    if (typeof params.comparePairKey === 'string') {
      recordComparisonMarker(params.comparePairKey);
    }
    const bytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: scale },
    });
    // Convert Uint8Array → base64
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const imageBase64 = btoa(binary);
    return {
      imageBase64,
      nodeId: node.id,
      nodeName: node.name,
      width: 'width' in node ? node.width : null,
      height: 'height' in node ? node.height : null,
    };
  },

  // figma_status: report current page, selection, document info.
  get_status: () => {
    const sel = figma.currentPage.selection;
    return {
      connected: true,
      fileName: figma.root.name,
      currentPage: {
        id: figma.currentPage.id,
        name: figma.currentPage.name,
        childCount: figma.currentPage.children.length,
      },
      selection: sel.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        ...(('width' in n) ? { width: n.width, height: n.height } : {}),
      })),
      pages: figma.root.children.map((p) => ({ id: p.id, name: p.name })),
    };
  },

  // seed_ios_kit: idempotently create the bundled iOS status bar / home
  // indicator / keyboard master components on "_Flaude iOS Kit", returning
  // their component IDs so callers instance directly instead of re-searching.
  seed_ios_kit: async () => seedIosKit(),

  // figma_navigate: scroll/zoom viewport to a node, and/or switch page.
  navigate: async (params) => {
    const { nodeId, pageId, pageName } = params as {
      nodeId?: string;
      pageId?: string;
      pageName?: string;
    };

    if (pageId || pageName) {
      const page = figma.root.children.find(
        (p) => p.id === pageId || p.name === pageName
      );
      if (!page) throw new Error(`Page not found: ${pageId || pageName}`);
      // setCurrentPageAsync (not the sync figma.currentPage assignment) is
      // required in dynamic-page documents.
      await figma.setCurrentPageAsync(page);
    }

    if (nodeId) {
      // getNodeByIdAsync (not the sync getNodeById) is required for nodes on
      // pages that aren't currently loaded in dynamic-page documents.
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error(`Node not found: ${nodeId}`);
      if ('x' in node) {
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
      }
    }

    return {
      success: true,
      currentPageId: figma.currentPage.id,
      currentPageName: figma.currentPage.name,
    };
  },

  // review_screen: the per-screen quality gate. Runs the deterministic
  // structural lint scoped to ONE built node (not the whole page), returns a
  // pass/fail verdict + the exact list of what's wrong, and records every
  // finding to the durable error ledger. This is the "compare and tell me
  // what to fix, don't call it done until it's clean" gate — the front half of
  // the auto-improvement loop. (Deterministic/structural only; the vision
  // judgment layer — "the gear should be a bell" — is a separate phase.)
  review_screen: async (params) => {
    const nodeId = params.nodeId as string | undefined;
    if (!nodeId) throw new Error('review_screen requires a `nodeId` (the built screen to review)');
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    const page = figma.currentPage;
    const pageHasRefFrames = page.children.some((n) => n.name.startsWith('REF /'));
    const findings = runStructuralLint(node, pageHasRefFrames);
    if (findings.length > 0) {
      recordFindings(findings as unknown as Array<Record<string, unknown>>, page.name);
    }
    return {
      nodeId,
      nodeName: 'name' in node ? (node as SceneNode).name : nodeId,
      pass: findings.length === 0,
      verdict:
        findings.length === 0
          ? 'PASS — no structural defects found. (Structural only; still verify concept/copy against the reference image and run compare_to_reference for pixel drift.)'
          : `NOT DONE — ${findings.length} defect${findings.length === 1 ? '' : 's'} must be fixed before this screen is finished.`,
      findings,
    };
  },

  // defect_report: read the durable error ledger back as an aggregate summary
  // — which defect classes recur, how persistently, across how many sessions.
  // This is the raw material the (later) analysis layer consumes to propose
  // new deterministic checks; also directly useful to a human auditing where
  // the agent keeps slipping.
  defect_report: async () => summarizeLedger(),
};

/**
 * Execute an MCP command
 */
export async function executeMCPCommand(
  command: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const handler = COMMAND_HANDLERS[command];

  if (!handler) {
    throw new Error(`Unknown MCP command: ${command}. Available commands: ${Object.keys(COMMAND_HANDLERS).join(', ')}`);
  }

  return handler(params);
}

/**
 * Get list of available commands (for documentation)
 */
export function getAvailableCommands(): string[] {
  return Object.keys(COMMAND_HANDLERS);
}
