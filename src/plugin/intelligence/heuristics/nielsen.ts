/**
 * Nielsen's 10 Usability Heuristics
 * Rules for evaluating UX quality
 */

export interface HeuristicViolation {
  heuristicId: number;
  heuristicName: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  recommendation: string;
  location?: string;
}

export interface HeuristicCheck {
  id: string;
  check: (context: CheckContext) => boolean;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  recommendation: string;
}

interface CheckContext {
  hasLoadingStates: boolean;
  hasProgressIndicators: boolean;
  hasFeedbackOnActions: boolean;
  hasErrorStates: boolean;
  hasBackNavigation: boolean;
  hasCancelOptions: boolean;
  buttonStyles: string[];
  navigationConsistent: boolean;
  hasConfirmationForDestructive: boolean;
  hasInputValidation: boolean;
  iconOnlyButtons: number;
  screenCrowded: boolean;
  errorMessagesSpecific: boolean;
  hasHelpOrTooltips: boolean;
}

// ============== NIELSEN'S 10 HEURISTICS ==============

export const NIELSEN_HEURISTICS = {
  visibility: {
    id: 1,
    name: 'Visibility of System Status',
    description: 'Keep users informed about what is going on through appropriate feedback within reasonable time',
    checks: [
      {
        id: 'has_loading_states',
        check: (ctx: CheckContext) => ctx.hasLoadingStates,
        severity: 'warning' as const,
        message: 'No loading indicators found',
        recommendation: 'Add loading spinners or skeletons when content is being fetched'
      },
      {
        id: 'has_progress_indicators',
        check: (ctx: CheckContext) => ctx.hasProgressIndicators,
        severity: 'warning' as const,
        message: 'No progress indicators for multi-step processes',
        recommendation: 'Show users where they are in multi-step flows'
      },
      {
        id: 'has_feedback_on_actions',
        check: (ctx: CheckContext) => ctx.hasFeedbackOnActions,
        severity: 'warning' as const,
        message: 'No visible feedback when user takes action',
        recommendation: 'Add success/error toasts or state changes on button clicks'
      }
    ]
  },

  match: {
    id: 2,
    name: 'Match Between System and Real World',
    description: 'Speak the users\' language, with words, phrases, and concepts familiar to the user',
    checks: [
      // These are harder to detect automatically - rely on text analysis
    ]
  },

  control: {
    id: 3,
    name: 'User Control and Freedom',
    description: 'Users often need a clearly marked "emergency exit" to leave unwanted states',
    checks: [
      {
        id: 'has_back_navigation',
        check: (ctx: CheckContext) => ctx.hasBackNavigation,
        severity: 'critical' as const,
        message: 'No way to go back found',
        recommendation: 'Add back buttons or navigation to allow users to return'
      },
      {
        id: 'has_cancel_options',
        check: (ctx: CheckContext) => ctx.hasCancelOptions,
        severity: 'warning' as const,
        message: 'No cancel option on forms',
        recommendation: 'Add cancel/close buttons to forms and modals'
      }
    ]
  },

  consistency: {
    id: 4,
    name: 'Consistency and Standards',
    description: 'Users should not have to wonder whether different words, situations, or actions mean the same thing',
    checks: [
      {
        id: 'consistent_button_styles',
        check: (ctx: CheckContext) => ctx.buttonStyles.length <= 3,
        severity: 'warning' as const,
        message: 'Inconsistent button styles detected',
        recommendation: 'Standardize button styles across the app'
      },
      {
        id: 'consistent_navigation',
        check: (ctx: CheckContext) => ctx.navigationConsistent,
        severity: 'critical' as const,
        message: 'Navigation changes between screens',
        recommendation: 'Keep navigation consistent across all screens'
      }
    ]
  },

  errorPrevention: {
    id: 5,
    name: 'Error Prevention',
    description: 'Even better than good error messages is a careful design which prevents a problem from occurring',
    checks: [
      {
        id: 'has_confirmation_for_destructive',
        check: (ctx: CheckContext) => ctx.hasConfirmationForDestructive,
        severity: 'critical' as const,
        message: 'No confirmation for destructive actions (delete/remove)',
        recommendation: 'Add confirmation dialogs for delete/remove actions'
      },
      {
        id: 'has_input_validation',
        check: (ctx: CheckContext) => ctx.hasInputValidation,
        severity: 'warning' as const,
        message: 'No inline validation on inputs',
        recommendation: 'Add real-time validation feedback on form inputs'
      }
    ]
  },

  recognition: {
    id: 6,
    name: 'Recognition Rather Than Recall',
    description: 'Minimize the user\'s memory load by making objects, actions, and options visible',
    checks: [
      {
        id: 'has_labels_not_just_icons',
        check: (ctx: CheckContext) => ctx.iconOnlyButtons < 3,
        severity: 'warning' as const,
        message: 'Multiple icon-only buttons without labels',
        recommendation: 'Add text labels to icons, especially for important actions'
      }
    ]
  },

  flexibility: {
    id: 7,
    name: 'Flexibility and Efficiency of Use',
    description: 'Accelerators may speed up interaction for expert users',
    checks: [
      // Shortcuts and accelerators - harder to detect in static designs
    ]
  },

  minimalism: {
    id: 8,
    name: 'Aesthetic and Minimalist Design',
    description: 'Interfaces should not contain information which is irrelevant or rarely needed',
    checks: [
      {
        id: 'not_overcrowded',
        check: (ctx: CheckContext) => !ctx.screenCrowded,
        severity: 'warning' as const,
        message: 'Screen appears overcrowded',
        recommendation: 'Simplify the interface - remove or hide less important elements'
      }
    ]
  },

  errorRecovery: {
    id: 9,
    name: 'Help Users Recognize, Diagnose, and Recover from Errors',
    description: 'Error messages should be expressed in plain language, precisely indicate the problem, and suggest a solution',
    checks: [
      {
        id: 'has_error_states',
        check: (ctx: CheckContext) => ctx.hasErrorStates,
        severity: 'critical' as const,
        message: 'No error states found',
        recommendation: 'Add clear error states for all forms and actions'
      },
      {
        id: 'errors_are_specific',
        check: (ctx: CheckContext) => ctx.errorMessagesSpecific,
        severity: 'warning' as const,
        message: 'Error messages may be too generic',
        recommendation: 'Make error messages specific and actionable'
      }
    ]
  },

  help: {
    id: 10,
    name: 'Help and Documentation',
    description: 'It may be necessary to provide help and documentation',
    checks: [
      {
        id: 'has_help_or_tooltips',
        check: (ctx: CheckContext) => ctx.hasHelpOrTooltips,
        severity: 'info' as const,
        message: 'No help tooltips or onboarding hints found',
        recommendation: 'Consider adding tooltips for complex features'
      }
    ]
  }
};

// ============== EVALUATION FUNCTION ==============

export function evaluateHeuristics(context: CheckContext): {
  violations: HeuristicViolation[];
  score: number;
  summary: string;
} {
  const violations: HeuristicViolation[] = [];

  for (const [, heuristic] of Object.entries(NIELSEN_HEURISTICS)) {
    for (const check of heuristic.checks) {
      try {
        if (!check.check(context)) {
          violations.push({
            heuristicId: heuristic.id,
            heuristicName: heuristic.name,
            severity: check.severity,
            message: check.message,
            recommendation: check.recommendation
          });
        }
      } catch {
        // Skip failed checks
      }
    }
  }

  // Calculate score (100 - deductions)
  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;
  const infoCount = violations.filter(v => v.severity === 'info').length;

  const score = Math.max(0, 100 - (criticalCount * 15) - (warningCount * 7) - (infoCount * 2));

  // Generate summary
  let summary: string;
  if (score >= 90) {
    summary = 'Excellent UX - minor improvements possible';
  } else if (score >= 70) {
    summary = 'Good UX - some issues to address';
  } else if (score >= 50) {
    summary = 'Fair UX - several issues need attention';
  } else {
    summary = 'Needs work - significant UX issues found';
  }

  return { violations, score, summary };
}

// ============== HELPER TO BUILD CONTEXT ==============

export function buildCheckContext(screenData: {
  hasLoadingStates: boolean;
  hasErrorStates: boolean;
  hasBackButton: boolean;
  hasCancelButton: boolean;
  buttonCount: number;
  inputCount: number;
  iconOnlyButtons: number;
  elementCount: number;
  hasProgressIndicator: boolean;
  hasDestructiveWithConfirm: boolean;
  hasTooltips: boolean;
}): CheckContext {
  return {
    hasLoadingStates: screenData.hasLoadingStates,
    hasProgressIndicators: screenData.hasProgressIndicator,
    hasFeedbackOnActions: screenData.hasLoadingStates || screenData.hasErrorStates,
    hasErrorStates: screenData.hasErrorStates,
    hasBackNavigation: screenData.hasBackButton,
    hasCancelOptions: screenData.hasCancelButton,
    buttonStyles: [], // Would need more analysis
    navigationConsistent: true, // Would need multi-screen analysis
    hasConfirmationForDestructive: screenData.hasDestructiveWithConfirm,
    hasInputValidation: screenData.hasErrorStates, // Proxy
    iconOnlyButtons: screenData.iconOnlyButtons,
    screenCrowded: screenData.elementCount > 30,
    errorMessagesSpecific: true, // Would need text analysis
    hasHelpOrTooltips: screenData.hasTooltips
  };
}
