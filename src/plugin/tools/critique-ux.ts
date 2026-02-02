/**
 * Tool: critique_ux
 * Applies UX heuristics and domain-specific checks
 */

import { evaluateHeuristics, buildCheckContext, type HeuristicViolation } from '../intelligence/heuristics/nielsen';
import { evaluateMentalHealthDomain, type DomainViolation } from '../intelligence/domain/mental-health';

export interface UXCritique {
  score: number;
  summary: string;
  heuristicViolations: HeuristicViolation[];
  domainViolations: DomainViolation[];
  allIssues: Array<{
    category: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    recommendation: string;
  }>;
  priorityFixes: string[];
}

export function critiqueUX(screenId?: string, domain?: string): UXCritique {
  const page = figma.currentPage;
  let framesToAnalyze: FrameNode[];

  if (screenId) {
    const node = figma.getNodeById(screenId);
    if (!node || (node.type !== 'FRAME' && node.type !== 'COMPONENT')) {
      return createEmptyCritique(`Screen ${screenId} not found or invalid`);
    }
    framesToAnalyze = [node as FrameNode];
  } else {
    framesToAnalyze = page.children.filter(
      n => n.type === 'FRAME' || n.type === 'COMPONENT'
    ) as FrameNode[];
  }

  // Aggregate data from all frames
  let hasLoadingStates = false;
  let hasErrorStates = false;
  let hasBackButton = false;
  let hasCancelButton = false;
  let buttonCount = 0;
  let inputCount = 0;
  let iconOnlyButtons = 0;
  let elementCount = 0;
  let hasProgressIndicator = false;
  let hasDestructiveWithConfirm = false;
  let hasTooltips = false;
  let allText = '';

  // For mental health domain
  let isExerciseScreen = false;
  let hasExitOption = false;
  let hasJournal = false;
  let hasSharingOption = false;
  let sharingIsOptional = true;
  let hasProgressIndicatorMH = false;

  for (const frame of framesToAnalyze) {
    const frameName = frame.name.toLowerCase();

    // Check frame-level patterns
    if (/exercise|activity|meditation/i.test(frameName)) {
      isExerciseScreen = true;
    }
    if (/journal|diary/i.test(frameName)) {
      hasJournal = true;
    }

    function processNode(n: SceneNode) {
      elementCount++;
      const nameLower = n.name.toLowerCase();

      // Extract text
      if (n.type === 'TEXT') {
        allText += ' ' + (n as TextNode).characters;
      }

      // Loading states
      if (/loading|spinner|skeleton/i.test(nameLower)) {
        hasLoadingStates = true;
      }

      // Error states
      if (/error|invalid|fail/i.test(nameLower)) {
        hasErrorStates = true;
      }

      // Back button
      if (/back|return|←|arrow.?left|chevron.?left/i.test(nameLower)) {
        hasBackButton = true;
      }

      // Cancel button
      if (/cancel|close|dismiss/i.test(nameLower)) {
        hasCancelButton = true;
      }

      // Exit option (for mental health)
      if (/exit|close|back|leave|quit/i.test(nameLower)) {
        hasExitOption = true;
      }

      // Buttons
      if (/button|btn|cta/i.test(nameLower)) {
        buttonCount++;
        // Icon-only check
        const hasTextChild = 'children' in n &&
          (n as FrameNode).children?.some(c => c.type === 'TEXT');
        if (!hasTextChild && n.type !== 'TEXT') {
          iconOnlyButtons++;
        }
      }

      // Inputs
      if (/input|field|text.?box/i.test(nameLower)) {
        inputCount++;
      }

      // Progress indicator
      if (/progress|step|page.?\d|indicator/i.test(nameLower)) {
        hasProgressIndicator = true;
        hasProgressIndicatorMH = true;
      }

      // Confirmation dialogs
      if (/confirm|are.?you.?sure/i.test(nameLower)) {
        hasDestructiveWithConfirm = true;
      }

      // Tooltips
      if (/tooltip|hint|help/i.test(nameLower)) {
        hasTooltips = true;
      }

      // Sharing
      if (/share|post|public/i.test(nameLower)) {
        hasSharingOption = true;
      }
      if (/optional|private|skip/i.test(nameLower)) {
        sharingIsOptional = true;
      }

      // Process children
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

  // Build heuristic check context
  const checkContext = buildCheckContext({
    hasLoadingStates,
    hasErrorStates,
    hasBackButton,
    hasCancelButton,
    buttonCount,
    inputCount,
    iconOnlyButtons,
    elementCount,
    hasProgressIndicator,
    hasDestructiveWithConfirm,
    hasTooltips,
  });

  // Evaluate Nielsen heuristics
  const heuristicResult = evaluateHeuristics(checkContext);

  // Domain-specific checks
  let domainViolations: DomainViolation[] = [];
  if (domain === 'mental_health') {
    const mentalHealthResult = evaluateMentalHealthDomain({
      allText,
      hasExitOption,
      hasProgressIndicator: hasProgressIndicatorMH,
      isExerciseScreen,
      hasJournal,
      hasSharingOption,
      sharingIsOptional,
    });
    domainViolations = mentalHealthResult.violations;
  }

  // Combine all issues
  const allIssues = [
    ...heuristicResult.violations.map(v => ({
      category: `Nielsen #${v.heuristicId}: ${v.heuristicName}`,
      severity: v.severity,
      message: v.message,
      recommendation: v.recommendation,
    })),
    ...domainViolations.map(v => ({
      category: v.category,
      severity: v.severity,
      message: v.message,
      recommendation: v.recommendation,
    })),
  ];

  // Sort by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Calculate combined score
  const domainPenalty = domainViolations.filter(v => v.severity === 'critical').length * 15 +
                        domainViolations.filter(v => v.severity === 'warning').length * 5;
  const combinedScore = Math.max(0, heuristicResult.score - domainPenalty);

  // Priority fixes
  const priorityFixes = allIssues
    .filter(i => i.severity === 'critical')
    .slice(0, 3)
    .map(i => i.recommendation);

  return {
    score: combinedScore,
    summary: heuristicResult.summary,
    heuristicViolations: heuristicResult.violations,
    domainViolations,
    allIssues,
    priorityFixes,
  };
}

function createEmptyCritique(message: string): UXCritique {
  return {
    score: 0,
    summary: message,
    heuristicViolations: [],
    domainViolations: [],
    allIssues: [],
    priorityFixes: [],
  };
}
