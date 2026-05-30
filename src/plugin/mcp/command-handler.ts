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
} from '../tools/edit-tools';

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

  validate_against_schema: (params) => validateAgainstSchema({
    schemaSection: params.schemaSection as string | undefined,
    expectedStates: params.expectedStates as string[] | undefined,
  }),

  // UTILITY COMMANDS
  zoom_to_node: (params) => {
    const node = figma.getNodeById(params.nodeId as string);
    if (node && 'x' in node) {
      figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
      return { success: true, nodeId: params.nodeId };
    }
    throw new Error(`Node not found: ${params.nodeId}`);
  },

  select_nodes: (params) => {
    const nodeIds = params.nodeIds as string[];
    const nodes: SceneNode[] = [];

    for (const id of nodeIds) {
      const node = figma.getNodeById(id);
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

  set_current_page: (params) => {
    const page = figma.root.children.find(p => p.id === params.pageId || p.name === params.pageName);
    if (page) {
      figma.currentPage = page;
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
  execute: async (params) => {
    const code = params.code as string;
    if (typeof code !== 'string' || !code.trim()) {
      throw new Error('execute requires a non-empty `code` string');
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function('figma', `return (async () => { ${code} })()`);
      const result = await fn(figma);
      // Return JSON-serializable data only
      return result === undefined ? null : result;
    } catch (err) {
      throw new Error(`execute failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  // figma_screenshot: export a node (or current selection) as a base64 PNG.
  screenshot: async (params) => {
    const scale = (params.scale as number) || 1;
    let node: SceneNode | null = null;
    if (params.nodeId) {
      const found = figma.getNodeById(params.nodeId as string);
      if (found && 'exportAsync' in found) node = found as SceneNode;
    } else {
      const sel = figma.currentPage.selection[0];
      if (sel) node = sel;
    }
    if (!node) {
      throw new Error('No node to screenshot: pass nodeId or select a node in Figma');
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

  // figma_navigate: scroll/zoom viewport to a node, and/or switch page.
  navigate: (params) => {
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
      figma.currentPage = page;
    }

    if (nodeId) {
      const node = figma.getNodeById(nodeId);
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
