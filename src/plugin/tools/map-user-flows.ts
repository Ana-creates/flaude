/**
 * Tool: map_user_flows
 * Maps all possible user journeys through the app
 *
 * SMART FLOW INFERENCE (3-layer architecture):
 * 1. Prototype links (explicit Figma connections)
 * 2. Universal patterns (naming sequences, position modifiers, common flows)
 * 3. Domain-specific knowledge (CBT phases, e-commerce funnel, etc.)
 */

import { analyzeFlows, type ScreenNode, type Flow, type FlowIssue, getFlowRecommendations } from '../intelligence/patterns/flow-patterns';
import {
  type FlowConnection,
  type ScreenWithMeta,
  detectDomain,
  getDomainDescription,
  inferUniversalConnections,
  inferDomainConnections,
  detectEntryPoint,
  mergeConnections,
  extractSequence,
  getPhaseInfo,
  DOMAIN_KNOWLEDGE,
} from '../intelligence/universal-flow-inference';

// Compact result to save tokens
export interface FlowMap {
  summary: {
    totalScreens: number;
    domain: string;
    domainConfidence: number;
    entryPoint: string | null;
  };
  flowGroups: Array<{
    name: string;
    screens: string[];
    entry: string;
  }>;
  issues: FlowIssue[];
  connections: Record<string, string[]>;
  stats: {
    totalScreens: number;
    connectedScreens: number;
    deadEnds: number;
    orphans: number;
  };
  screens: string[];
  metadata: {
    prototype: number;
    universal: number;
    domain: number;
    spatial: number;
  };
}

export function mapUserFlows(includePrototypeLinks: boolean = true): FlowMap {
  const page = figma.currentPage;
  const frames = page.children.filter(
    node => node.type === 'FRAME' || node.type === 'COMPONENT'
  ) as FrameNode[];

  // Build screens with metadata
  const screens: ScreenWithMeta[] = frames.map(frame => ({
    id: frame.id,
    name: frame.name,
    x: frame.x,
    y: frame.y,
  }));

  const screenNames = screens.map(s => s.name);

  // ============== LAYER 1: PROTOTYPE LINKS ==============
  const prototypeConnections: FlowConnection[] = [];
  const prototypeByScreen = new Map<string, Set<string>>();

  if (includePrototypeLinks) {
    for (const frame of frames) {
      const exits = new Set<string>();
      extractPrototypeLinks(frame, exits);

      prototypeByScreen.set(frame.id, exits);

      for (const targetId of exits) {
        const target = screens.find(s => s.id === targetId);
        if (target) {
          prototypeConnections.push({
            fromId: frame.id,
            fromName: frame.name,
            toId: targetId,
            toName: target.name,
            trigger: 'Prototype link',
            confidence: 1.0,
            source: 'prototype',
          });
        }
      }
    }
  }

  // ============== LAYER 2: UNIVERSAL PATTERNS ==============
  const universalConnections = inferUniversalConnections(screens);

  // ============== LAYER 3: DOMAIN-SPECIFIC ==============
  const domain = detectDomain(screenNames);
  let domainConnections: FlowConnection[] = [];
  let domainConfidence = 0;

  if (domain) {
    domainConnections = inferDomainConnections(screens, domain);
    // Calculate domain confidence based on how many screens match phases
    const config = DOMAIN_KNOWLEDGE[domain];
    if (config) {
      const matchingScreens = screens.filter(s =>
        config.phases.some(p => p.pattern.test(s.name))
      );
      domainConfidence = matchingScreens.length / screens.length;
    }
  }

  // ============== LAYER 4: SPATIAL INFERENCE (fallback) ==============
  const spatialConnections = inferSpatialConnections(screens, [
    ...prototypeConnections,
    ...universalConnections,
    ...domainConnections
  ]);

  // ============== MERGE ALL CONNECTIONS ==============
  const allConnections = mergeConnections(
    prototypeConnections,
    universalConnections,
    domainConnections,
    spatialConnections
  );

  // Build connection lookup by source frame
  const connectionsByFrame = new Map<string, string[]>();
  for (const conn of allConnections) {
    if (!connectionsByFrame.has(conn.fromId)) {
      connectionsByFrame.set(conn.fromId, []);
    }
    connectionsByFrame.get(conn.fromId)!.push(conn.toId);
  }

  // ============== DETECT ENTRY POINT ==============
  const entryPoint = detectEntryPoint(screens);

  // ============== BUILD SCREEN NODES FOR ANALYSIS ==============
  const screenNodes: ScreenNode[] = frames.map((frame) => {
    const allExits = connectionsByFrame.get(frame.id) || [];

    // Analyze frame contents
    let hasBackButton = false;
    let hasForm = false;
    let hasList = false;
    let hasLoadingState = false;
    let hasErrorState = false;
    let hasEmptyState = false;

    function processNode(n: SceneNode) {
      const nameLower = n.name.toLowerCase();

      if (/back|return|←|arrow.?left|chevron.?left/i.test(nameLower)) hasBackButton = true;
      if (/form|input|field|text.?field/i.test(nameLower)) hasForm = true;
      if (/list|scroll|feed/i.test(nameLower)) hasList = true;
      if (/loading|spinner|skeleton/i.test(nameLower)) hasLoadingState = true;
      if (/error|fail/i.test(nameLower)) hasErrorState = true;
      if (/empty|no.?result|nothing/i.test(nameLower)) hasEmptyState = true;

      if ('children' in n) {
        for (const child of (n as FrameNode).children) {
          processNode(child);
        }
      }
    }

    for (const child of frame.children) {
      processNode(child);
    }

    // Infer screen type from name
    const name = frame.name.toLowerCase();
    let type = 'unknown';
    if (/splash|launch/i.test(name)) type = 'splash';
    else if (/login|sign.?in/i.test(name)) type = 'login';
    else if (/signup|register|create.?account/i.test(name)) type = 'signup';
    else if (/onboarding|welcome|intro|tutorial/i.test(name)) type = 'onboarding';
    else if (/dashboard|home|main/i.test(name)) type = 'dashboard';
    else if (/list|feed|browse|catalog|search/i.test(name)) type = 'list';
    else if (/detail|view|item/i.test(name)) type = 'detail';
    else if (/settings|preferences/i.test(name)) type = 'settings';
    else if (/profile|account/i.test(name)) type = 'profile';
    else if (/cart|basket/i.test(name)) type = 'cart';
    else if (/checkout|payment/i.test(name)) type = 'checkout';
    else if (/confirm|success|complete|done/i.test(name)) type = 'confirmation';
    else if (/error|fail/i.test(name)) type = 'error';
    else if (/modal|popup|dialog/i.test(name)) type = 'modal';

    const isEntryPoint = entryPoint?.id === frame.id;

    return {
      id: frame.id,
      name: frame.name,
      type,
      exits: [...new Set(allExits)],
      depth: 0,
      hasBackButton,
      hasForm,
      hasList,
      hasLoadingState,
      hasErrorState,
      hasEmptyState,
      isEntryPoint,
    };
  });

  // ============== ANALYZE FLOWS ==============
  const analysis = analyzeFlows(screenNodes);
  const recommendations = getFlowRecommendations(analysis.issues);

  // ============== BUILD SCREEN GRAPH ==============
  const screenGraph = screens.map(s => {
    const protoLinks = prototypeByScreen.get(s.id) || new Set();
    const allLinks = connectionsByFrame.get(s.id) || [];
    const inferredLinks = allLinks.filter(id => !protoLinks.has(id));

    const phaseInfo = domain ? getPhaseInfo(s.name, domain) : null;

    return {
      id: s.id,
      name: s.name,
      phase: phaseInfo?.phase,
      phaseOrder: phaseInfo?.order,
      prototypeLinks: [...protoLinks].map(id => {
        const target = screens.find(t => t.id === id);
        return target ? target.name : id;
      }),
      inferredLinks: inferredLinks.map(id => {
        const target = screens.find(t => t.id === id);
        return target ? target.name : id;
      }),
    };
  });

  // ============== DETECT FLOW GROUPS ==============
  const detectedFlowGroups = detectFlowGroups(screens, domain);

  // ============== BUILD COMPACT RESULT (to save tokens) ==============

  // Compact screen list (just name + phase)
  const compactScreens = screens.map(s => {
    const phaseInfo = domain ? getPhaseInfo(s.name, domain) : null;
    return phaseInfo ? `${s.name} [${phaseInfo.phase}]` : s.name;
  });

  // Compact connections (just from→to, grouped by source)
  const connectionsBySource: Record<string, string[]> = {
    prototype: [],
    universal: [],
    domain: [],
    spatial: [],
  };
  for (const c of allConnections) {
    connectionsBySource[c.source].push(`${c.fromName} → ${c.toName}`);
  }

  return {
    // Summary
    summary: {
      totalScreens: screens.length,
      domain: domain || 'general',
      domainConfidence: domain ? Math.round(domainConfidence * 100) : 0,
      entryPoint: entryPoint?.name || null,
    },

    // Compact flow groups (most important for agent)
    flowGroups: detectedFlowGroups.map(g => ({
      name: g.name,
      screens: g.screens,
      entry: g.entryPoint,
    })),

    // Issues (kept full)
    issues: analysis.issues.slice(0, 10), // Limit to 10

    // Compact connections by source
    connections: connectionsBySource,

    // Stats
    stats: analysis.stats,

    // Screen list (compact)
    screens: compactScreens,

    // Metadata
    metadata: {
      prototype: prototypeConnections.length,
      universal: universalConnections.length,
      domain: domainConnections.length,
      spatial: spatialConnections.length,
    },
  };
}

// ============== HELPER FUNCTIONS ==============

/**
 * Extract prototype links from a frame
 */
function extractPrototypeLinks(frame: FrameNode, exits: Set<string>): void {
  function processNode(n: SceneNode) {
    if ('reactions' in n) {
      const reactions = (n as SceneNode & { reactions: Reaction[] }).reactions;
      if (reactions) {
        for (const reaction of reactions) {
          if (reaction.action?.type === 'NODE' && reaction.action?.destinationId) {
            exits.add(reaction.action.destinationId);
          }
        }
      }
    }

    if ('children' in n) {
      for (const child of (n as FrameNode).children) {
        processNode(child);
      }
    }
  }

  for (const child of frame.children) {
    processNode(child);
  }
}

/**
 * Infer spatial connections (left-to-right, top-to-bottom)
 * Only applied when few other connections exist
 */
function inferSpatialConnections(
  screens: ScreenWithMeta[],
  existingConnections: FlowConnection[]
): FlowConnection[] {
  // Only apply spatial inference if we have few connections
  const existingRatio = existingConnections.length / Math.max(screens.length - 1, 1);
  if (existingRatio > 0.5) {
    // Already have enough connections, skip spatial
    return [];
  }

  const connections: FlowConnection[] = [];
  const rowThreshold = 200;

  // Group into rows
  const rows: ScreenWithMeta[][] = [];
  for (const screen of screens) {
    let foundRow = false;
    for (const row of rows) {
      if (Math.abs(row[0].y - screen.y) < rowThreshold) {
        row.push(screen);
        foundRow = true;
        break;
      }
    }
    if (!foundRow) {
      rows.push([screen]);
    }
  }

  // Sort rows by Y, screens within row by X
  rows.sort((a, b) => a[0].y - b[0].y);
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
  }

  // Connect within rows
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) {
      const existing = existingConnections.some(
        c => c.fromId === row[i].id && c.toId === row[i + 1].id
      );
      if (!existing) {
        connections.push({
          fromId: row[i].id,
          fromName: row[i].name,
          toId: row[i + 1].id,
          toName: row[i + 1].name,
          trigger: 'Spatial: left to right',
          confidence: 0.6,
          source: 'spatial',
        });
      }
    }
  }

  // Connect between rows
  for (let i = 0; i < rows.length - 1; i++) {
    const lastOfRow = rows[i][rows[i].length - 1];
    const firstOfNext = rows[i + 1][0];

    const existing = existingConnections.some(
      c => c.fromId === lastOfRow.id && c.toId === firstOfNext.id
    );
    if (!existing) {
      connections.push({
        fromId: lastOfRow.id,
        fromName: lastOfRow.name,
        toId: firstOfNext.id,
        toName: firstOfNext.name,
        trigger: 'Spatial: row continuation',
        confidence: 0.5,
        source: 'spatial',
      });
    }
  }

  return connections;
}

/**
 * Detect flow groups based on sequences and domain phases
 */
function detectFlowGroups(
  screens: ScreenWithMeta[],
  domain: string | null
): Array<{ name: string; screens: string[]; entryPoint: string; phase?: string }> {
  const groups: Array<{ name: string; screens: string[]; entryPoint: string; phase?: string }> = [];

  // Group by sequence base
  const sequenceGroups = new Map<string, ScreenWithMeta[]>();
  for (const screen of screens) {
    const seq = extractSequence(screen.name);
    if (seq) {
      const key = seq.base.toLowerCase();
      if (!sequenceGroups.has(key)) sequenceGroups.set(key, []);
      sequenceGroups.get(key)!.push(screen);
    }
  }

  for (const [base, groupScreens] of sequenceGroups) {
    if (groupScreens.length >= 2) {
      groupScreens.sort((a, b) => {
        const seqA = extractSequence(a.name);
        const seqB = extractSequence(b.name);
        return (seqA?.num || 0) - (seqB?.num || 0);
      });

      groups.push({
        name: base === 'numbered' ? 'Main Flow' : base,
        screens: groupScreens.map(s => s.name),
        entryPoint: groupScreens[0].name,
      });
    }
  }

  // Group by domain phases
  if (domain && DOMAIN_KNOWLEDGE[domain]) {
    const config = DOMAIN_KNOWLEDGE[domain];
    const phaseGroups = new Map<string, ScreenWithMeta[]>();

    for (const screen of screens) {
      const phaseInfo = getPhaseInfo(screen.name, domain);
      if (phaseInfo) {
        if (!phaseGroups.has(phaseInfo.phase)) {
          phaseGroups.set(phaseInfo.phase, []);
        }
        phaseGroups.get(phaseInfo.phase)!.push(screen);
      }
    }

    for (const [phase, phaseScreens] of phaseGroups) {
      if (phaseScreens.length >= 1) {
        // Don't duplicate if already in sequence groups
        const alreadyGrouped = groups.some(g =>
          phaseScreens.some(ps => g.screens.includes(ps.name))
        );

        if (!alreadyGrouped) {
          phaseScreens.sort((a, b) => a.x - b.x);
          groups.push({
            name: phase,
            screens: phaseScreens.map(s => s.name),
            entryPoint: phaseScreens[0].name,
            phase,
          });
        }
      }
    }
  }

  // Group by prefix (Auth/Login, Auth/Signup)
  const prefixGroups = new Map<string, ScreenWithMeta[]>();
  for (const screen of screens) {
    const match = screen.name.match(/^([^/\-–—:]+)[/\-–—:]/);
    if (match) {
      const prefix = match[1].trim();
      if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
      prefixGroups.get(prefix)!.push(screen);
    }
  }

  for (const [prefix, prefixScreens] of prefixGroups) {
    if (prefixScreens.length >= 2) {
      const alreadyGrouped = groups.some(g =>
        prefixScreens.some(ps => g.screens.includes(ps.name))
      );

      if (!alreadyGrouped) {
        prefixScreens.sort((a, b) => a.x - b.x);
        groups.push({
          name: prefix,
          screens: prefixScreens.map(s => s.name),
          entryPoint: prefixScreens[0].name,
        });
      }
    }
  }

  return groups;
}

interface Reaction {
  action?: {
    type: string;
    destinationId?: string;
  };
}
