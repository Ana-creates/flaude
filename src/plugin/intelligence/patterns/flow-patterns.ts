/**
 * Flow Pattern Recognition
 * Rules for identifying user journeys and flow issues
 */

export interface FlowIssue {
  type: 'dead_end' | 'orphan' | 'no_back' | 'missing_error_path' | 'missing_loading' | 'missing_empty';
  screenId: string;
  screenName: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  recommendation: string;
}

export interface Flow {
  name: string;
  path: string[];
  isHappyPath: boolean;
  description: string;
}

export interface ScreenNode {
  id: string;
  name: string;
  type: string;
  exits: string[];
  depth: number;
  hasBackButton: boolean;
  hasForm: boolean;
  hasList: boolean;
  hasLoadingState: boolean;
  hasErrorState: boolean;
  hasEmptyState: boolean;
  isEntryPoint: boolean;
}

// ============== EXPECTED FLOWS BY APP TYPE ==============

export const FLOW_PATTERNS = {
  authentication: {
    happyPath: ['splash', 'login', 'dashboard'],
    alternativePaths: [
      { name: 'New User', path: ['splash', 'signup', 'onboarding', 'dashboard'] },
      { name: 'Password Recovery', path: ['login', 'forgot_password', 'check_email', 'login'] },
    ],
    requiredConnections: [
      { from: 'login', to: 'signup', reason: 'New users need a path to create account' },
      { from: 'login', to: 'forgot_password', reason: 'Users need password recovery' },
    ]
  },

  onboarding: {
    happyPath: ['welcome', 'step1', 'step2', 'step3', 'dashboard'],
    requiredFeatures: ['skip_option', 'progress_indicator', 'back_navigation'],
  },

  ecommerce: {
    happyPath: ['browse', 'product_detail', 'cart', 'checkout', 'confirmation'],
    requiredConnections: [
      { from: 'any', to: 'cart', reason: 'Cart should always be accessible' },
      { from: 'checkout', to: 'cart', reason: 'User should be able to return to cart' },
    ]
  },

  mentalHealth: {
    happyPath: ['home', 'mood_check', 'exercise', 'completion'],
    safetyRequirements: [
      'exit_option_always_visible',
      'crisis_resources_accessible',
      'no_forced_completion',
    ]
  }
};

// ============== FLOW ISSUE DETECTION ==============

export const FLOW_ISSUE_DETECTORS: Array<{
  type: FlowIssue['type'];
  detect: (screen: ScreenNode, allScreens: ScreenNode[]) => boolean;
  severity: FlowIssue['severity'];
  getMessage: (screen: ScreenNode) => string;
  getRecommendation: (screen: ScreenNode) => string;
}> = [
  {
    type: 'dead_end',
    detect: (screen, allScreens) => {
      // Has exits? Not a dead end
      if (screen.exits.length > 0) return false;

      // Is this a terminal screen type? Not a problem
      const terminalTypes = ['confirmation', 'success', 'complete', 'error', 'modal'];
      if (terminalTypes.includes(screen.type)) return false;

      // Check if name suggests it's a terminal screen
      const terminalKeywords = /confirm|success|complete|done|finish|thank|modal|popup|dialog|error/i;
      if (terminalKeywords.test(screen.name)) return false;

      // Check if it's at the end of a detected flow (last screen in sequence)
      const screenIndex = allScreens.findIndex(s => s.id === screen.id);
      const isLastScreen = screenIndex === allScreens.length - 1;
      if (isLastScreen && allScreens.length > 1) {
        // Check if previous screen links to this one - then it's a valid endpoint
        const prevScreen = allScreens[screenIndex - 1];
        if (prevScreen && prevScreen.exits.includes(screen.id)) return false;
      }

      return true;
    },
    severity: 'warning', // Downgraded from critical - let agent decide if it's really an issue
    getMessage: (screen) => `Screen "${screen.name}" has no visible exit`,
    getRecommendation: () => 'Verify if this is intentional (e.g., final step) or add navigation'
  },

  {
    type: 'orphan',
    detect: (screen, allScreens) => {
      // Entry points can't be orphans
      if (screen.isEntryPoint) return false;

      // Check for incoming connections
      const hasIncoming = allScreens.some(s => s.exits.includes(screen.id));
      if (hasIncoming) return false;

      // Check if this is part of a numbered sequence (might be connected by inference)
      const hasSequenceNumber = /^\d+[.-]?\d*\s/.test(screen.name);
      if (hasSequenceNumber) return false;

      // Check if screen has a common prefix with other screens (likely grouped)
      const prefix = screen.name.split(/[-–—:/]/)[0].trim();
      const hasRelatedScreens = allScreens.some(s =>
        s.id !== screen.id && s.name.startsWith(prefix) && prefix.length > 2
      );
      if (hasRelatedScreens) return false;

      return true;
    },
    severity: 'info', // Downgraded - might be intentional or inferred
    getMessage: (screen) => `Screen "${screen.name}" has no explicit incoming links`,
    getRecommendation: () => 'Verify this screen is reachable in the user flow'
  },

  {
    type: 'no_back',
    detect: (screen) => screen.depth > 1 && !screen.hasBackButton,
    severity: 'warning',
    getMessage: (screen) => `Screen "${screen.name}" has no back button - user can't return`,
    getRecommendation: () => 'Add a back button or navigation to return to previous screen'
  },

  {
    type: 'missing_error_path',
    detect: (screen) => screen.hasForm && !screen.hasErrorState,
    severity: 'critical',
    getMessage: (screen) => `Form on "${screen.name}" has no error state`,
    getRecommendation: () => 'Add error states for form validation and submission failures'
  },

  {
    type: 'missing_loading',
    detect: (screen) => {
      // Screens that likely fetch data
      const likelyFetchesData = /dashboard|list|feed|profile|detail/i.test(screen.name) ||
                                screen.type === 'dashboard' || screen.type === 'list';
      return likelyFetchesData && !screen.hasLoadingState;
    },
    severity: 'warning',
    getMessage: (screen) => `Screen "${screen.name}" likely fetches data but has no loading state`,
    getRecommendation: () => 'Add a loading skeleton or spinner state'
  },

  {
    type: 'missing_empty',
    detect: (screen) => screen.hasList && !screen.hasEmptyState,
    severity: 'warning',
    getMessage: (screen) => `List on "${screen.name}" has no empty state`,
    getRecommendation: () => 'Add an empty state for when the list has no items'
  }
];

// ============== FLOW ANALYSIS ==============

export function analyzeFlows(screens: ScreenNode[]): {
  flows: Flow[];
  issues: FlowIssue[];
  stats: {
    totalScreens: number;
    connectedScreens: number;
    deadEnds: number;
    orphans: number;
  };
} {
  const issues: FlowIssue[] = [];

  // Detect issues
  for (const screen of screens) {
    for (const detector of FLOW_ISSUE_DETECTORS) {
      if (detector.detect(screen, screens)) {
        issues.push({
          type: detector.type,
          screenId: screen.id,
          screenName: screen.name,
          severity: detector.severity,
          message: detector.getMessage(screen),
          recommendation: detector.getRecommendation(screen)
        });
      }
    }
  }

  // Find flows
  const flows = findFlows(screens);

  // Calculate stats
  const deadEnds = screens.filter(s => s.exits.length === 0).length;
  const orphans = screens.filter(s => {
    const hasIncoming = screens.some(other => other.exits.includes(s.id));
    return !hasIncoming && !s.isEntryPoint;
  }).length;

  return {
    flows,
    issues,
    stats: {
      totalScreens: screens.length,
      connectedScreens: screens.length - orphans,
      deadEnds,
      orphans
    }
  };
}

function findFlows(screens: ScreenNode[]): Flow[] {
  const flows: Flow[] = [];

  // Find entry points
  const entryPoints = screens.filter(s => s.isEntryPoint || /splash|welcome|login|home/i.test(s.name));

  if (entryPoints.length === 0 && screens.length > 0) {
    // Use first screen as entry point
    entryPoints.push(screens[0]);
  }

  // Trace paths from entry points
  for (const entry of entryPoints) {
    const visited = new Set<string>();
    const path = [entry.name];
    tracePath(entry, screens, visited, path, flows);
  }

  // Mark the longest flow as happy path
  if (flows.length > 0) {
    flows.sort((a, b) => b.path.length - a.path.length);
    flows[0].isHappyPath = true;
  }

  return flows;
}

function tracePath(
  current: ScreenNode,
  allScreens: ScreenNode[],
  visited: Set<string>,
  path: string[],
  flows: Flow[]
): void {
  visited.add(current.id);

  if (current.exits.length === 0) {
    // End of path
    if (path.length > 1) {
      flows.push({
        name: `${path[0]} → ${path[path.length - 1]}`,
        path: [...path],
        isHappyPath: false,
        description: inferFlowDescription(path)
      });
    }
    return;
  }

  for (const exitId of current.exits) {
    if (visited.has(exitId)) continue;

    const nextScreen = allScreens.find(s => s.id === exitId);
    if (!nextScreen) continue;

    path.push(nextScreen.name);
    tracePath(nextScreen, allScreens, visited, path, flows);
    path.pop();
  }
}

function inferFlowDescription(path: string[]): string {
  const pathStr = path.join(' ').toLowerCase();

  if (/login|signup|register/.test(pathStr) && /dashboard|home/.test(pathStr)) {
    return 'Authentication flow';
  }
  if (/product|cart|checkout/.test(pathStr)) {
    return 'Purchase flow';
  }
  if (/onboarding|welcome|step/.test(pathStr)) {
    return 'Onboarding flow';
  }
  if (/mood|journal|exercise/.test(pathStr)) {
    return 'Wellness activity flow';
  }
  if (/settings|profile/.test(pathStr)) {
    return 'Settings/profile flow';
  }

  return 'User flow';
}

export function getFlowRecommendations(issues: FlowIssue[]): string[] {
  const recommendations: string[] = [];

  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  if (criticalCount > 0) {
    recommendations.push(`Fix ${criticalCount} critical flow issue(s) before shipping`);
  }

  if (issues.some(i => i.type === 'dead_end')) {
    recommendations.push('Review dead-end screens - ensure users can always navigate away');
  }

  if (issues.some(i => i.type === 'orphan')) {
    recommendations.push('Connect orphan screens to the main flow or remove if unused');
  }

  if (issues.some(i => i.type === 'missing_error_path')) {
    recommendations.push('Add error handling states to all forms');
  }

  return recommendations;
}
