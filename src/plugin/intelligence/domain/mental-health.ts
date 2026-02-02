/**
 * Mental Health App Domain Knowledge
 * Specialized rules for mental health/wellness applications
 */

export interface DomainViolation {
  category: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  recommendation: string;
  reference?: string;
}

// ============== SAFETY REQUIREMENTS ==============

export const SAFETY_REQUIREMENTS = [
  {
    id: 'crisis_resources',
    description: 'Crisis hotline or resources always accessible',
    severity: 'critical' as const,
    check: (screenData: ScreenData) => {
      const text = screenData.allText.toLowerCase();
      return text.includes('crisis') ||
             text.includes('hotline') ||
             text.includes('emergency') ||
             text.includes('988') ||
             text.includes('help line');
    },
    message: 'No crisis resources found',
    recommendation: 'Add easily accessible crisis resources (e.g., 988 Suicide & Crisis Lifeline)'
  },
  {
    id: 'exit_option',
    description: 'User can always exit exercises/activities',
    severity: 'critical' as const,
    check: (screenData: ScreenData) => {
      if (!screenData.isExerciseScreen) return true;
      return screenData.hasExitOption;
    },
    message: 'Exercise screen has no exit option',
    recommendation: 'Always allow users to exit activities - never trap them'
  },
  {
    id: 'no_forced_sharing',
    description: 'All sharing/journaling should be optional',
    severity: 'warning' as const,
    check: (screenData: ScreenData) => {
      if (!screenData.hasJournal && !screenData.hasSharingOption) return true;
      return screenData.sharingIsOptional;
    },
    message: 'Sharing or journaling appears to be required',
    recommendation: 'Make all sharing optional - respect user privacy and comfort'
  },
  {
    id: 'progress_visible',
    description: 'User can see their progress in exercises',
    severity: 'warning' as const,
    check: (screenData: ScreenData) => {
      if (!screenData.isExerciseScreen) return true;
      return screenData.hasProgressIndicator;
    },
    message: 'Exercise has no progress indicator',
    recommendation: 'Show users how far along they are in exercises'
  }
];

// ============== SCREEN-SPECIFIC CHECKS ==============

export const SCREEN_TYPE_CHECKS = {
  moodCheck: {
    shouldHave: [
      { element: 'skip_option', message: 'Mood check should be skippable' },
      { element: 'neutral_default', message: 'Should not pre-select a mood' },
      { element: 'no_judgment_copy', message: 'Copy should be non-judgmental' }
    ],
    shouldNotHave: [
      { element: 'required_explanation', message: 'Don\'t require users to explain their mood' },
      { element: 'shame_language', message: 'Avoid language that could shame users' }
    ]
  },

  journal: {
    shouldHave: [
      { element: 'auto_save_indicator', message: 'Show that entries are being saved' },
      { element: 'privacy_indicator', message: 'Reassure users about privacy' },
      { element: 'optional_sharing', message: 'Make sharing clearly optional' }
    ],
    shouldNotHave: [
      { element: 'public_by_default', message: 'Never make entries public by default' },
      { element: 'word_minimum', message: 'Don\'t require minimum word counts' }
    ]
  },

  exercise: {
    shouldHave: [
      { element: 'pause_option', message: 'Allow pausing exercises' },
      { element: 'exit_option', message: 'Always allow exit' },
      { element: 'progress_indicator', message: 'Show exercise progress' },
      { element: 'estimated_time', message: 'Show how long exercises take' }
    ],
    shouldNotHave: [
      { element: 'no_exit', message: 'Never trap users in exercises' },
      { element: 'shame_for_quitting', message: 'Don\'t shame users who quit early' }
    ]
  },

  results: {
    shouldHave: [
      { element: 'encouraging_language', message: 'Use encouraging tone' },
      { element: 'next_steps', message: 'Provide clear next steps' },
      { element: 'celebrate_progress', message: 'Celebrate any progress made' }
    ],
    shouldNotHave: [
      { element: 'comparison_to_others', message: 'Don\'t compare to other users' },
      { element: 'negative_labels', message: 'Avoid negative clinical labels' },
      { element: 'diagnostic_language', message: 'Don\'t use diagnostic terminology' }
    ]
  }
};

// ============== COPY GUIDELINES ==============

export const COPY_GUIDELINES = {
  avoid: [
    { text: 'you should', reason: 'Too prescriptive' },
    { text: 'you must', reason: 'Too demanding' },
    { text: 'you failed', reason: 'Judgmental' },
    { text: 'normal people', reason: 'Othering' },
    { text: 'depressed', reason: 'Avoid clinical labels' },
    { text: 'anxious', reason: 'Avoid clinical labels' },
    { text: 'crazy', reason: 'Stigmatizing' },
    { text: 'fix yourself', reason: 'Blaming' },
    { text: 'just', reason: 'Minimizing (e.g., "just relax")' },
    { text: 'simple', reason: 'Dismissive of difficulty' }
  ],

  prefer: [
    { text: 'you might try', reason: 'Suggestive, not prescriptive' },
    { text: 'when you\'re ready', reason: 'Respects user pace' },
    { text: 'many people find', reason: 'Normalizing' },
    { text: 'your feelings are valid', reason: 'Validating' },
    { text: 'it\'s okay to', reason: 'Permission-giving' },
    { text: 'take your time', reason: 'No pressure' },
    { text: 'you\'re doing great', reason: 'Encouraging' },
    { text: 'progress, not perfection', reason: 'Growth mindset' }
  ]
};

// ============== FLOW REQUIREMENTS ==============

export const FLOW_REQUIREMENTS = {
  mustAlwaysBeAccessible: [
    { screen: 'crisis_resources', reason: 'Users in crisis need immediate access' },
    { screen: 'settings', reason: 'Users should control their experience' },
    { screen: 'exit', reason: 'Users should never feel trapped' }
  ],

  shouldNeverTrap: [
    { flow: 'exercises', reason: 'User may become distressed' },
    { flow: 'assessments', reason: 'User may not want to complete' },
    { flow: 'onboarding', reason: 'User may want to explore first' }
  ],

  shouldConfirmBeforeExit: [
    { context: 'unsaved_journal', reason: 'Prevent losing emotional writing' },
    { context: 'mid_exercise', reason: 'Gentle check-in before leaving' }
  ]
};

// ============== EVALUATION FUNCTION ==============

interface ScreenData {
  screenType?: string;
  allText: string;
  hasExitOption: boolean;
  hasProgressIndicator: boolean;
  isExerciseScreen: boolean;
  hasJournal: boolean;
  hasSharingOption: boolean;
  sharingIsOptional: boolean;
}

export function evaluateMentalHealthDomain(screenData: ScreenData): {
  violations: DomainViolation[];
  score: number;
  isSafe: boolean;
} {
  const violations: DomainViolation[] = [];

  // Check safety requirements
  for (const requirement of SAFETY_REQUIREMENTS) {
    if (!requirement.check(screenData)) {
      violations.push({
        category: 'Safety',
        severity: requirement.severity,
        message: requirement.message,
        recommendation: requirement.recommendation,
        reference: requirement.id
      });
    }
  }

  // Check copy guidelines
  const textLower = screenData.allText.toLowerCase();
  for (const guideline of COPY_GUIDELINES.avoid) {
    if (textLower.includes(guideline.text)) {
      violations.push({
        category: 'Copy',
        severity: 'warning',
        message: `Found "${guideline.text}" - ${guideline.reason}`,
        recommendation: `Consider rephrasing to be more supportive`
      });
    }
  }

  // Screen-specific checks
  if (screenData.screenType && SCREEN_TYPE_CHECKS[screenData.screenType as keyof typeof SCREEN_TYPE_CHECKS]) {
    const checks = SCREEN_TYPE_CHECKS[screenData.screenType as keyof typeof SCREEN_TYPE_CHECKS];

    for (const should of checks.shouldNotHave) {
      // These need more context to check properly
      // For now, flag as info
    }
  }

  // Calculate score
  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;

  const score = Math.max(0, 100 - (criticalCount * 20) - (warningCount * 5));
  const isSafe = criticalCount === 0;

  return { violations, score, isSafe };
}

// ============== THERAPEUTIC VALIDITY CHECKS ==============

export const CBT_ELEMENTS = {
  thoughtRecord: {
    requiredComponents: [
      'situation_input',
      'automatic_thought_input',
      'emotion_selection',
      'evidence_for_input',
      'evidence_against_input',
      'balanced_thought_input'
    ],
    commonMissing: 'cognitive_distortion_identification'
  },

  behavioralActivation: {
    requiredComponents: [
      'activity_selection',
      'mood_before',
      'mood_after',
      'scheduling_capability'
    ]
  },

  exposureHierarchy: {
    requiredComponents: [
      'fear_list',
      'suds_rating',
      'gradual_steps',
      'progress_tracking'
    ],
    safetyNote: 'Should include therapist guidance disclaimer'
  }
};

export function checkCBTValidity(screenData: {
  type: string;
  components: string[];
}): { isValid: boolean; missing: string[]; warnings: string[] } {
  const cbtType = screenData.type as keyof typeof CBT_ELEMENTS;

  if (!CBT_ELEMENTS[cbtType]) {
    return { isValid: true, missing: [], warnings: [] };
  }

  const required = CBT_ELEMENTS[cbtType].requiredComponents;
  const missing = required.filter(c => !screenData.components.includes(c));

  const warnings: string[] = [];
  if (cbtType === 'exposureHierarchy') {
    warnings.push('Exposure exercises should recommend professional guidance');
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings
  };
}
