/**
 * Universal Flow Inference
 * Works for ANY app type, with domain-specific enhancements
 *
 * Architecture:
 * 1. Universal patterns (naming, position, common flows)
 * 2. Domain detection (mental health, ecommerce, saas, social)
 * 3. Domain-specific phase ordering
 */

// ============== TYPES ==============

export interface FlowConnection {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  trigger: string;
  confidence: number;
  source: 'prototype' | 'universal' | 'domain' | 'spatial';
}

export interface ScreenWithMeta {
  id: string;
  name: string;
  x: number;
  y: number;
  phase?: string;
  phaseOrder?: number;
  sequenceBase?: string;
  sequenceNum?: number;
}

export interface DomainPhase {
  name: string;
  pattern: RegExp;
  order: number;
}

export interface DomainConfig {
  detect: (screenNames: string[]) => boolean;
  phases: DomainPhase[];
  description: string;
}

// ============== UNIVERSAL PATTERNS ==============

export const UNIVERSAL_PATTERNS = {

  // Sequence patterns: "Step 1" → "Step 2", "Onboarding 1" → "Onboarding 2"
  sequencePatterns: [
    {
      // "1.0 Splash", "1.1 Login", "2.0 Dashboard"
      pattern: /^(\d+)\.(\d+)\s+(.+)$/,
      extract: (name: string) => {
        const match = name.match(/^(\d+)\.(\d+)\s+(.+)$/);
        if (match) {
          return {
            base: match[3].trim(),
            major: parseInt(match[1]),
            minor: parseInt(match[2]),
            num: parseInt(match[1]) * 100 + parseInt(match[2])
          };
        }
        return null;
      }
    },
    {
      // "Step 1", "Onboarding 2", "Screen 3"
      pattern: /^(.+?)[\s_-]+(\d+)$/,
      extract: (name: string) => {
        const match = name.match(/^(.+?)[\s_-]+(\d+)$/);
        if (match) {
          return { base: match[1].trim(), num: parseInt(match[2]) };
        }
        return null;
      }
    },
    {
      // "1 Splash", "2 Login", "3 Dashboard"
      pattern: /^(\d+)[\s_-]+(.+)$/,
      extract: (name: string) => {
        const match = name.match(/^(\d+)[\s_-]+(.+)$/);
        if (match) {
          return { base: 'numbered', num: parseInt(match[1]) };
        }
        return null;
      }
    },
    {
      // "Step One", "Phase Two"
      pattern: /^(.+?)[\s_-]*(one|two|three|four|five|six|seven|eight|nine|ten)$/i,
      extract: (name: string) => {
        const words: Record<string, number> = {
          one: 1, two: 2, three: 3, four: 4, five: 5,
          six: 6, seven: 7, eight: 8, nine: 9, ten: 10
        };
        const match = name.match(/^(.+?)[\s_-]*(one|two|three|four|five|six|seven|eight|nine|ten)$/i);
        if (match) {
          return { base: match[1].trim(), num: words[match[2].toLowerCase()] };
        }
        return null;
      }
    }
  ],

  // Position modifiers: "Intro to X" comes before "X"
  positionModifiers: {
    before: [
      { pattern: /^intro(?:\s+to)?/i, remove: /^intro(?:\s+to)?\s*/i },
      { pattern: /^welcome(?:\s+to)?/i, remove: /^welcome(?:\s+to)?\s*/i },
      { pattern: /^start/i, remove: /^start\s*/i },
      { pattern: /^begin/i, remove: /^begin\s*/i },
      { pattern: /^overview(?:\s+of)?/i, remove: /^overview(?:\s+of)?\s*/i },
      { pattern: /^getting\s+started/i, remove: /^getting\s+started\s*/i },
    ],
    after: [
      { pattern: /confirm(?:ation)?$/i, remove: /\s*confirm(?:ation)?$/i },
      { pattern: /validation$/i, remove: /\s*validation$/i },
      { pattern: /success$/i, remove: /\s*success$/i },
      { pattern: /complete[d]?$/i, remove: /\s*complete[d]?$/i },
      { pattern: /done$/i, remove: /\s*done$/i },
      { pattern: /result[s]?$/i, remove: /\s*result[s]?$/i },
      { pattern: /summary$/i, remove: /\s*summary$/i },
      { pattern: /review$/i, remove: /\s*review$/i },
    ]
  },

  // Common flow patterns (universal across app types)
  commonFlows: [
    // Launch/Auth
    { from: /^splash|^launch|^start$/i, to: /login|signup|onboard|home/i, confidence: 0.85 },
    { from: /login|sign.?in/i, to: /home|dashboard|main|feed/i, confidence: 0.9 },
    { from: /signup|register|create.?account/i, to: /verify|onboard|welcome|profile.?setup/i, confidence: 0.85 },
    { from: /forgot|reset.?password/i, to: /check.?email|confirm|login/i, confidence: 0.8 },
    { from: /verify|otp|code/i, to: /success|home|dashboard|onboard/i, confidence: 0.8 },

    // Onboarding
    { from: /welcome/i, to: /onboard|tutorial|home|get.?started/i, confidence: 0.75 },
    { from: /onboard/i, to: /home|dashboard|main/i, confidence: 0.75 },
    { from: /tutorial/i, to: /home|dashboard|complete/i, confidence: 0.7 },

    // Navigation
    { from: /home|dashboard/i, to: /settings|profile|notification/i, confidence: 0.6 },
    { from: /settings/i, to: /profile|account|notification|privacy|logout/i, confidence: 0.65 },
    { from: /profile/i, to: /edit|settings|home/i, confidence: 0.6 },

    // Lists & Details
    { from: /list|browse|feed|explore|search|catalog/i, to: /detail|view|item|post|article|product/i, confidence: 0.75 },
    { from: /search/i, to: /result|list|detail/i, confidence: 0.7 },

    // Forms & Actions
    { from: /form|edit|create|add|new/i, to: /confirm|preview|success|list/i, confidence: 0.75 },
    { from: /preview/i, to: /confirm|submit|publish/i, confidence: 0.8 },

    // Modal patterns
    { from: /modal|popup|dialog/i, to: /close|back|confirm/i, confidence: 0.6 },
  ],

  // Entry point signals
  entryPoints: {
    strong: /^(splash|launch|start|welcome|intro|landing|loading)$/i,
    medium: /^(login|signup|onboarding|home)$/i,
    weak: /^(main|index|root|app)$/i
  },

  // Terminal/exit point signals
  exitPoints: {
    terminal: /^(success|complete|done|finish|thank|confirmation|error|404|empty)$/i,
    soft: /^(home|dashboard|main|settings|profile)$/i
  }
};

// ============== DOMAIN-SPECIFIC KNOWLEDGE ==============

export const DOMAIN_KNOWLEDGE: Record<string, DomainConfig> = {

  mental_health: {
    description: 'Mental health / CBT therapy application',
    detect: (screenNames: string[]) => {
      const allNames = screenNames.join(' ').toLowerCase();
      const signals = [
        /cbt|cognitive/i,
        /therap/i,
        /thought/i,
        /emotion|feeling|mood/i,
        /belief/i,
        /reframe|restructur/i,
        /distortion/i,
        /socratic/i,
        /journal/i,
        /mindful/i,
        /anxiety|stress|depression/i,
        /self.?care|wellness/i,
      ];
      const matchCount = signals.filter(s => s.test(allNames)).length;
      return matchCount >= 3;
    },
    phases: [
      { name: 'Education', pattern: /intro|education|learn|what.?is|about/i, order: 1 },
      { name: 'Check-in', pattern: /mood|check.?in|feeling|rate|how.?are/i, order: 2 },
      { name: 'Situation', pattern: /situation|trigger|event|what.?happened/i, order: 3 },
      { name: 'Thought Capture', pattern: /thought|identify|capture|automatic/i, order: 4 },
      { name: 'Emotion', pattern: /emotion|feeling|affect/i, order: 5 },
      { name: 'Core Beliefs', pattern: /core.?belief|belief|schema/i, order: 6 },
      { name: 'Origin', pattern: /origin|history|childhood|where.?did|root/i, order: 7 },
      { name: 'Evidence', pattern: /evidence|proof|support|against/i, order: 8 },
      { name: 'Distortions', pattern: /distortion|thinking.?error|cognitive.?error/i, order: 9 },
      { name: 'Restructuring', pattern: /restructur|reframe|challeng|alternative/i, order: 10 },
      { name: 'Socratic', pattern: /socratic|question|inquiry/i, order: 11 },
      { name: 'Balanced Thought', pattern: /balanced|new.?thought|perspective|rational/i, order: 12 },
      { name: 'Action', pattern: /behavio|experiment|action|practice|cope/i, order: 13 },
      { name: 'Completion', pattern: /complete|reward|progress|done|summary/i, order: 14 },
    ]
  },

  ecommerce: {
    description: 'E-commerce / shopping application',
    detect: (screenNames: string[]) => {
      const allNames = screenNames.join(' ').toLowerCase();
      const signals = [
        /product/i,
        /cart|basket/i,
        /checkout/i,
        /payment|pay/i,
        /shop/i,
        /buy|purchase/i,
        /order/i,
        /price|cost/i,
        /shipping|delivery/i,
      ];
      const matchCount = signals.filter(s => s.test(allNames)).length;
      return matchCount >= 3;
    },
    phases: [
      { name: 'Browse', pattern: /home|shop|browse|categor|search|explore/i, order: 1 },
      { name: 'Product List', pattern: /list|catalog|collection|result/i, order: 2 },
      { name: 'Product Detail', pattern: /product|item|detail/i, order: 3 },
      { name: 'Cart', pattern: /cart|bag|basket/i, order: 4 },
      { name: 'Checkout', pattern: /checkout|shipping|address|delivery/i, order: 5 },
      { name: 'Payment', pattern: /payment|pay|card|billing/i, order: 6 },
      { name: 'Review', pattern: /review|confirm|summary/i, order: 7 },
      { name: 'Confirmation', pattern: /success|thank|order|receipt|complete/i, order: 8 },
    ]
  },

  saas: {
    description: 'SaaS / productivity application',
    detect: (screenNames: string[]) => {
      const allNames = screenNames.join(' ').toLowerCase();
      const signals = [
        /dashboard/i,
        /analytics/i,
        /settings/i,
        /team|member/i,
        /workspace|project/i,
        /subscription|billing/i,
        /integration/i,
        /admin/i,
      ];
      const matchCount = signals.filter(s => s.test(allNames)).length;
      return matchCount >= 3;
    },
    phases: [
      { name: 'Onboarding', pattern: /onboard|welcome|setup|getting.?started/i, order: 1 },
      { name: 'Dashboard', pattern: /dashboard|home|overview/i, order: 2 },
      { name: 'Projects', pattern: /project|workspace|board/i, order: 3 },
      { name: 'Create', pattern: /create|new|add|edit/i, order: 4 },
      { name: 'Detail', pattern: /detail|view|item/i, order: 5 },
      { name: 'Team', pattern: /team|member|invite|collaborat/i, order: 6 },
      { name: 'Settings', pattern: /settings|preferences|account/i, order: 7 },
      { name: 'Billing', pattern: /billing|subscription|plan|upgrade/i, order: 8 },
    ]
  },

  social: {
    description: 'Social media / community application',
    detect: (screenNames: string[]) => {
      const allNames = screenNames.join(' ').toLowerCase();
      const signals = [
        /feed/i,
        /post/i,
        /profile/i,
        /follow/i,
        /like/i,
        /comment/i,
        /share/i,
        /message|chat|dm/i,
        /story|stories/i,
      ];
      const matchCount = signals.filter(s => s.test(allNames)).length;
      return matchCount >= 3;
    },
    phases: [
      { name: 'Feed', pattern: /feed|home|timeline/i, order: 1 },
      { name: 'Content', pattern: /post|photo|video|story|reel/i, order: 2 },
      { name: 'Detail', pattern: /detail|view|single/i, order: 3 },
      { name: 'Create', pattern: /create|new|compose|upload/i, order: 4 },
      { name: 'Profile', pattern: /profile|user|account/i, order: 5 },
      { name: 'Social', pattern: /follow|friend|connect|request/i, order: 6 },
      { name: 'Messaging', pattern: /message|chat|dm|inbox|conversation/i, order: 7 },
      { name: 'Notifications', pattern: /notif|alert|activity/i, order: 8 },
    ]
  },

  fintech: {
    description: 'Finance / banking application',
    detect: (screenNames: string[]) => {
      const allNames = screenNames.join(' ').toLowerCase();
      const signals = [
        /balance/i,
        /transaction/i,
        /transfer|send/i,
        /budget/i,
        /expense/i,
        /account/i,
        /bank/i,
        /invest/i,
        /card/i,
      ];
      const matchCount = signals.filter(s => s.test(allNames)).length;
      return matchCount >= 3;
    },
    phases: [
      { name: 'Dashboard', pattern: /home|dashboard|overview|balance/i, order: 1 },
      { name: 'Accounts', pattern: /account|wallet|card/i, order: 2 },
      { name: 'Transactions', pattern: /transaction|history|activity/i, order: 3 },
      { name: 'Transfer', pattern: /transfer|send|pay/i, order: 4 },
      { name: 'Recipient', pattern: /recipient|contact|beneficiary/i, order: 5 },
      { name: 'Amount', pattern: /amount|how.?much/i, order: 6 },
      { name: 'Confirm', pattern: /confirm|review|summary/i, order: 7 },
      { name: 'Success', pattern: /success|complete|receipt/i, order: 8 },
    ]
  }
};

// ============== INFERENCE FUNCTIONS ==============

/**
 * Detect domain from screen names
 */
export function detectDomain(screenNames: string[]): string | null {
  for (const [domain, config] of Object.entries(DOMAIN_KNOWLEDGE)) {
    if (config.detect(screenNames)) {
      return domain;
    }
  }
  return null;
}

/**
 * Extract sequence info from screen name
 */
export function extractSequence(name: string): { base: string; num: number; major?: number; minor?: number } | null {
  for (const seqPattern of UNIVERSAL_PATTERNS.sequencePatterns) {
    const result = seqPattern.extract(name);
    if (result) {
      return result;
    }
  }
  return null;
}

/**
 * Find sequences in screens
 */
export function findSequences(screens: ScreenWithMeta[]): Array<{ base: string; screens: ScreenWithMeta[] }> {
  const groups = new Map<string, Array<{ screen: ScreenWithMeta; num: number }>>();

  for (const screen of screens) {
    const seq = extractSequence(screen.name);
    if (seq) {
      const key = seq.base.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ screen, num: seq.num });
    }
  }

  const sequences: Array<{ base: string; screens: ScreenWithMeta[] }> = [];
  for (const [base, items] of groups) {
    if (items.length > 1) {
      const sorted = items.sort((a, b) => a.num - b.num).map(i => i.screen);
      sequences.push({ base, screens: sorted });
    }
  }

  return sequences;
}

/**
 * Infer connections using universal patterns
 */
export function inferUniversalConnections(screens: ScreenWithMeta[]): FlowConnection[] {
  const connections: FlowConnection[] = [];

  // 1. SEQUENCE CONNECTIONS (Step 1 → Step 2)
  const sequences = findSequences(screens);
  for (const seq of sequences) {
    for (let i = 0; i < seq.screens.length - 1; i++) {
      connections.push({
        fromId: seq.screens[i].id,
        fromName: seq.screens[i].name,
        toId: seq.screens[i + 1].id,
        toName: seq.screens[i + 1].name,
        trigger: `Sequence: ${seq.base}`,
        confidence: 0.9,
        source: 'universal'
      });
    }
  }

  // 2. POSITION MODIFIER CONNECTIONS (Intro to X → X)
  for (const screen of screens) {
    const nameLower = screen.name.toLowerCase();

    // Check "before" modifiers (Intro to X → X)
    for (const mod of UNIVERSAL_PATTERNS.positionModifiers.before) {
      if (mod.pattern.test(nameLower)) {
        const baseName = nameLower.replace(mod.remove, '').trim();
        if (baseName.length > 2) {
          const target = screens.find(s =>
            s.id !== screen.id &&
            s.name.toLowerCase() === baseName
          );
          if (target && !connectionExists(connections, screen.id, target.id)) {
            connections.push({
              fromId: screen.id,
              fromName: screen.name,
              toId: target.id,
              toName: target.name,
              trigger: `"${screen.name}" introduces "${target.name}"`,
              confidence: 0.85,
              source: 'universal'
            });
          }
        }
      }
    }

    // Check "after" modifiers (X → X Confirmation)
    for (const mod of UNIVERSAL_PATTERNS.positionModifiers.after) {
      if (mod.pattern.test(nameLower)) {
        const baseName = nameLower.replace(mod.remove, '').trim();
        if (baseName.length > 2) {
          const source = screens.find(s =>
            s.id !== screen.id &&
            s.name.toLowerCase() === baseName
          );
          if (source && !connectionExists(connections, source.id, screen.id)) {
            connections.push({
              fromId: source.id,
              fromName: source.name,
              toId: screen.id,
              toName: screen.name,
              trigger: `"${source.name}" leads to "${screen.name}"`,
              confidence: 0.85,
              source: 'universal'
            });
          }
        }
      }
    }
  }

  // 3. COMMON FLOW PATTERNS (Login → Dashboard)
  for (const pattern of UNIVERSAL_PATTERNS.commonFlows) {
    const fromScreens = screens.filter(s => pattern.from.test(s.name));
    const toScreens = screens.filter(s => pattern.to.test(s.name));

    for (const from of fromScreens) {
      for (const to of toScreens) {
        if (from.id !== to.id && !connectionExists(connections, from.id, to.id)) {
          connections.push({
            fromId: from.id,
            fromName: from.name,
            toId: to.id,
            toName: to.name,
            trigger: `Common pattern: ${from.name} → ${to.name}`,
            confidence: pattern.confidence,
            source: 'universal'
          });
        }
      }
    }
  }

  return connections;
}

/**
 * Infer connections using domain-specific knowledge
 */
export function inferDomainConnections(screens: ScreenWithMeta[], domain: string): FlowConnection[] {
  const config = DOMAIN_KNOWLEDGE[domain];
  if (!config) return [];

  const connections: FlowConnection[] = [];

  // Categorize screens by phase
  const categorized: Array<ScreenWithMeta & { phase: string; phaseOrder: number }> = [];

  for (const screen of screens) {
    for (const phase of config.phases) {
      if (phase.pattern.test(screen.name)) {
        categorized.push({
          ...screen,
          phase: phase.name,
          phaseOrder: phase.order
        });
        break;
      }
    }
  }

  // Group by phase
  const phases = new Map<string, typeof categorized>();
  for (const screen of categorized) {
    if (!phases.has(screen.phase)) phases.set(screen.phase, []);
    phases.get(screen.phase)!.push(screen);
  }

  // Sort phases by order
  const sortedPhaseNames = [...phases.keys()].sort((a, b) => {
    const aPhase = config.phases.find(p => p.name === a);
    const bPhase = config.phases.find(p => p.name === b);
    return (aPhase?.order || 99) - (bPhase?.order || 99);
  });

  // Connect between phases (last of phase A → first of phase B)
  for (let i = 0; i < sortedPhaseNames.length - 1; i++) {
    const currentPhaseScreens = phases.get(sortedPhaseNames[i])!;
    const nextPhaseScreens = phases.get(sortedPhaseNames[i + 1])!;

    // Sort screens within phase by position (left-to-right)
    currentPhaseScreens.sort((a, b) => a.x - b.x);
    nextPhaseScreens.sort((a, b) => a.x - b.x);

    const lastOfCurrent = currentPhaseScreens[currentPhaseScreens.length - 1];
    const firstOfNext = nextPhaseScreens[0];

    if (lastOfCurrent && firstOfNext) {
      connections.push({
        fromId: lastOfCurrent.id,
        fromName: lastOfCurrent.name,
        toId: firstOfNext.id,
        toName: firstOfNext.name,
        trigger: `${domain}: ${sortedPhaseNames[i]} → ${sortedPhaseNames[i + 1]}`,
        confidence: 0.8,
        source: 'domain'
      });
    }
  }

  // Connect within phases (if multiple screens)
  for (const [phaseName, phaseScreens] of phases) {
    if (phaseScreens.length > 1) {
      // Sort by position
      phaseScreens.sort((a, b) => a.x - b.x);

      for (let i = 0; i < phaseScreens.length - 1; i++) {
        connections.push({
          fromId: phaseScreens[i].id,
          fromName: phaseScreens[i].name,
          toId: phaseScreens[i + 1].id,
          toName: phaseScreens[i + 1].name,
          trigger: `${domain}: Within ${phaseName}`,
          confidence: 0.75,
          source: 'domain'
        });
      }
    }
  }

  return connections;
}

/**
 * Detect entry point
 */
export function detectEntryPoint(screens: ScreenWithMeta[]): ScreenWithMeta | null {
  // Check strong signals first
  for (const screen of screens) {
    if (UNIVERSAL_PATTERNS.entryPoints.strong.test(screen.name)) {
      return screen;
    }
  }

  // Check medium signals
  for (const screen of screens) {
    if (UNIVERSAL_PATTERNS.entryPoints.medium.test(screen.name)) {
      return screen;
    }
  }

  // Check sequence number 1
  for (const screen of screens) {
    const seq = extractSequence(screen.name);
    if (seq && seq.num === 1) {
      return screen;
    }
  }

  // Fallback to leftmost screen
  if (screens.length > 0) {
    return screens.reduce((leftmost, s) => s.x < leftmost.x ? s : leftmost);
  }

  return null;
}

/**
 * Check if terminal screen
 */
export function isTerminalScreen(name: string): boolean {
  return UNIVERSAL_PATTERNS.exitPoints.terminal.test(name);
}

/**
 * Merge connections (deduplicate)
 */
export function mergeConnections(...connectionArrays: FlowConnection[][]): FlowConnection[] {
  const merged: FlowConnection[] = [];
  const seen = new Set<string>();

  for (const connections of connectionArrays) {
    for (const conn of connections) {
      const key = `${conn.fromId}->${conn.toId}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(conn);
      }
    }
  }

  return merged;
}

/**
 * Check if connection exists
 */
function connectionExists(connections: FlowConnection[], fromId: string, toId: string): boolean {
  return connections.some(c => c.fromId === fromId && c.toId === toId);
}

/**
 * Get domain description
 */
export function getDomainDescription(domain: string): string {
  return DOMAIN_KNOWLEDGE[domain]?.description || 'General application';
}

/**
 * Get phase info for a screen
 */
export function getPhaseInfo(screenName: string, domain: string): { phase: string; order: number } | null {
  const config = DOMAIN_KNOWLEDGE[domain];
  if (!config) return null;

  for (const phase of config.phases) {
    if (phase.pattern.test(screenName)) {
      return { phase: phase.name, order: phase.order };
    }
  }

  return null;
}
