/**
 * Screen Pattern Recognition
 * Rules for identifying what a screen is FOR
 */

import type { ComponentClassification } from './component-patterns';

export interface ScreenClassification {
  type: string;
  purpose: string;
  expectedData: string[];
  expectedExits: string[];
  confidence: number;
  missingElements: MissingElement[];
}

export interface MissingElement {
  element: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

interface ScreenInfo {
  id: string;
  name: string;
  components: ComponentClassification[];
  textContent: string[];
  hasBackButton: boolean;
  hasPrototypeLinks: boolean;
}

// ============== SCREEN PATTERNS ==============

export const SCREEN_PATTERNS: Record<string, ScreenPattern> = {
  // ============== AUTHENTICATION ==============
  login: {
    signals: [
      (s) => hasComponents(s, ['input:email', 'input:password', 'button:primary']),
      (s) => /login|sign.?in/i.test(s.name),
      (s) => hasText(s, ['sign in', 'log in', 'welcome back']),
    ],
    purpose: 'Authenticate returning user',
    expectedData: ['email', 'password'],
    expectedExits: ['dashboard', 'forgot_password', 'signup'],
    missingChecks: [
      { element: 'forgot_password_link', check: (s) => hasText(s, ['forgot', 'reset']), severity: 'warning', message: "No 'Forgot password' option" },
      { element: 'signup_link', check: (s) => hasText(s, ['sign up', 'create', 'register']), severity: 'warning', message: "No way for new users to create account" },
      { element: 'error_state', check: (s) => hasComponent(s, 'error'), severity: 'critical', message: "No error state for invalid credentials" },
    ]
  },

  signup: {
    signals: [
      (s) => hasComponents(s, ['input:email', 'input:password', 'button:primary']),
      (s) => /signup|sign.?up|register|create.?account/i.test(s.name),
      (s) => hasText(s, ['create account', 'sign up', 'get started', 'register']),
    ],
    purpose: 'Register new user',
    expectedData: ['email', 'password', 'name'],
    expectedExits: ['onboarding', 'dashboard', 'login'],
    missingChecks: [
      { element: 'terms_checkbox', check: (s) => hasText(s, ['terms', 'privacy', 'agree']), severity: 'warning', message: "No terms/privacy agreement" },
      { element: 'login_link', check: (s) => hasText(s, ['log in', 'sign in', 'already have']), severity: 'warning', message: "No way for existing users to log in" },
    ]
  },

  forgotPassword: {
    signals: [
      (s) => /forgot|reset|recover/i.test(s.name),
      (s) => hasComponent(s, 'input:email') && !hasComponent(s, 'input:password'),
      (s) => hasText(s, ['reset', 'recover', 'forgot', 'email']),
    ],
    purpose: 'Help user recover account access',
    expectedData: ['email'],
    expectedExits: ['login', 'check_email_confirmation'],
    missingChecks: []
  },

  // ============== ONBOARDING ==============
  onboarding: {
    signals: [
      (s) => /onboarding|welcome|intro|tutorial|step/i.test(s.name),
      (s) => hasText(s, ['next', 'continue', 'skip', 'get started']),
    ],
    purpose: 'Guide new user through setup',
    expectedData: ['preferences', 'profile_info'],
    expectedExits: ['next_step', 'skip_to_dashboard'],
    missingChecks: [
      { element: 'skip_option', check: (s) => hasText(s, ['skip']), severity: 'warning', message: "No way to skip onboarding" },
      { element: 'progress_indicator', check: (s) => /step|progress|\d.?of.?\d/i.test(s.textContent.join(' ')), severity: 'info', message: "User can't see progress" },
    ]
  },

  // ============== CORE SCREENS ==============
  dashboard: {
    signals: [
      (s) => /dashboard|home|main|overview/i.test(s.name),
      (s) => hasComponent(s, 'card') && countComponents(s, 'card') >= 2,
      (s) => hasComponent(s, 'navigation'),
    ],
    purpose: 'Main hub - overview of key information',
    expectedData: [],
    expectedExits: ['detail_screens', 'settings', 'profile'],
    missingChecks: []
  },

  list: {
    signals: [
      (s) => hasComponent(s, 'list'),
      (s) => /list|feed|browse|explore|search.?results/i.test(s.name),
    ],
    purpose: 'Browse multiple items',
    expectedData: [],
    expectedExits: ['detail_screen', 'filter', 'search'],
    missingChecks: [
      { element: 'empty_state', check: (s) => hasText(s, ['no results', 'empty', 'nothing']), severity: 'critical', message: "No empty state if list is empty" },
      { element: 'loading_state', check: (s) => hasComponent(s, 'loading'), severity: 'warning', message: "No loading state" },
    ]
  },

  detail: {
    signals: [
      (s) => s.hasBackButton,
      (s) => /detail|view|info|-detail$/i.test(s.name),
    ],
    purpose: 'View details of one item',
    expectedData: [],
    expectedExits: ['back_to_list', 'edit', 'share'],
    missingChecks: []
  },

  settings: {
    signals: [
      (s) => /settings|preferences|config/i.test(s.name),
      (s) => hasText(s, ['settings', 'preferences', 'account']),
    ],
    purpose: 'Configure app preferences',
    expectedData: ['user_preferences'],
    expectedExits: ['back', 'logout', 'sub_settings'],
    missingChecks: [
      { element: 'logout', check: (s) => hasText(s, ['log out', 'logout', 'sign out']), severity: 'critical', message: "No way to log out" },
    ]
  },

  profile: {
    signals: [
      (s) => /profile|account|me|user/i.test(s.name),
      (s) => hasText(s, ['profile', 'account', 'edit profile']),
    ],
    purpose: 'View/edit user profile',
    expectedData: ['profile_updates'],
    expectedExits: ['edit_profile', 'settings', 'logout'],
    missingChecks: []
  },

  // ============== FORMS ==============
  form: {
    signals: [
      (s) => countComponents(s, 'input') >= 3,
      (s) => hasComponent(s, 'button:primary'),
      (s) => /form|edit|create|add|new/i.test(s.name),
    ],
    purpose: 'Collect user input',
    expectedData: ['form_fields'],
    expectedExits: ['success_confirmation', 'cancel_back'],
    missingChecks: [
      { element: 'validation_states', check: (s) => hasComponent(s, 'error'), severity: 'critical', message: "No field validation states" },
      { element: 'cancel_option', check: (s) => hasComponent(s, 'button:secondary') || hasText(s, ['cancel', 'back']), severity: 'warning', message: "No way to cancel" },
    ]
  },

  // ============== E-COMMERCE ==============
  productList: {
    signals: [
      (s) => /shop|products|catalog|store/i.test(s.name),
      (s) => hasText(s, ['$', '€', '£', 'price', 'add to cart']),
    ],
    purpose: 'Browse products',
    expectedData: [],
    expectedExits: ['product_detail', 'cart', 'filter'],
    missingChecks: []
  },

  productDetail: {
    signals: [
      (s) => /product.?detail|item.?detail/i.test(s.name),
      (s) => hasText(s, ['add to cart', 'buy now', 'price', '$']),
    ],
    purpose: 'View product and purchase',
    expectedData: ['quantity', 'variant_selection'],
    expectedExits: ['add_to_cart', 'back_to_list', 'checkout'],
    missingChecks: []
  },

  cart: {
    signals: [
      (s) => /cart|bag|basket/i.test(s.name),
      (s) => hasText(s, ['cart', 'bag', 'total', 'checkout']),
    ],
    purpose: 'Review items before purchase',
    expectedData: ['quantity_updates'],
    expectedExits: ['checkout', 'continue_shopping', 'remove_items'],
    missingChecks: [
      { element: 'empty_cart_state', check: (s) => hasText(s, ['empty', 'no items']), severity: 'critical', message: "No empty cart state" },
      { element: 'remove_option', check: (s) => hasText(s, ['remove', 'delete']), severity: 'warning', message: "Can't remove items" },
    ]
  },

  checkout: {
    signals: [
      (s) => /checkout|payment/i.test(s.name),
      (s) => hasText(s, ['checkout', 'payment', 'pay', 'place order']),
    ],
    purpose: 'Complete purchase',
    expectedData: ['shipping_address', 'payment_info'],
    expectedExits: ['order_confirmation', 'back_to_cart'],
    missingChecks: [
      { element: 'order_summary', check: (s) => hasText(s, ['total', 'summary', 'order']), severity: 'critical', message: "User can't see what they're buying" },
    ]
  },

  // ============== MENTAL HEALTH ==============
  moodCheck: {
    signals: [
      (s) => /mood|feeling|emotion|check.?in|how.?are/i.test(s.name),
      (s) => hasText(s, ['mood', 'feeling', 'how are you', 'today']),
    ],
    purpose: 'Capture user\'s emotional state',
    expectedData: ['mood_rating', 'emotion_selection'],
    expectedExits: ['journal', 'recommendations', 'dashboard'],
    missingChecks: []
  },

  journal: {
    signals: [
      (s) => /journal|diary|write|reflect|thought/i.test(s.name),
      (s) => hasComponent(s, 'input:textarea'),
    ],
    purpose: 'Free-form reflection/writing',
    expectedData: ['journal_entry'],
    expectedExits: ['save', 'dashboard'],
    missingChecks: [
      { element: 'auto_save', check: () => false, severity: 'warning', message: "No auto-save - user might lose entry" },
    ]
  },

  exercise: {
    signals: [
      (s) => /exercise|activity|meditation|breathing|cbt|therapy/i.test(s.name),
      (s) => hasText(s, ['start', 'begin', 'exercise', 'activity', 'breathe']),
    ],
    purpose: 'Guided therapeutic exercise',
    expectedData: ['completion_status', 'duration'],
    expectedExits: ['complete', 'exit_early', 'pause'],
    missingChecks: [
      { element: 'exit_option', check: (s) => hasText(s, ['exit', 'close', 'back', 'leave']), severity: 'critical', message: "User might feel trapped - no exit" },
      { element: 'progress_indicator', check: (s) => /\d.*of.*\d|step|progress/i.test(s.textContent.join(' ')), severity: 'warning', message: "User can't see how much is left" },
    ]
  },

  // ============== RESULTS / CONFIRMATION ==============
  confirmation: {
    signals: [
      (s) => /confirm|success|complete|done|thank/i.test(s.name),
      (s) => hasComponent(s, 'success'),
      (s) => hasText(s, ['success', 'complete', 'done', 'thank you', 'confirmed']),
    ],
    purpose: 'Confirm action completion',
    expectedData: [],
    expectedExits: ['dashboard', 'next_action'],
    missingChecks: []
  },

  error: {
    signals: [
      (s) => /error|fail|problem|oops/i.test(s.name),
      (s) => hasComponent(s, 'error'),
      (s) => hasText(s, ['error', 'failed', 'problem', 'wrong', 'oops']),
    ],
    purpose: 'Show error and recovery options',
    expectedData: [],
    expectedExits: ['retry', 'back', 'help'],
    missingChecks: [
      { element: 'retry_option', check: (s) => hasText(s, ['retry', 'try again']), severity: 'warning', message: "No retry option" },
    ]
  },
};

// ============== HELPER FUNCTIONS ==============

interface ScreenPattern {
  signals: Array<(screen: ScreenInfo) => boolean>;
  purpose: string;
  expectedData: string[];
  expectedExits: string[];
  missingChecks: Array<{
    element: string;
    check: (screen: ScreenInfo) => boolean;
    severity: 'critical' | 'warning' | 'info';
    message: string;
  }>;
}

function hasComponent(screen: ScreenInfo, typeOrSubtype: string): boolean {
  const [type, subtype] = typeOrSubtype.split(':');
  return screen.components.some(c => {
    if (subtype) {
      return c.type === type && c.subtype === subtype;
    }
    return c.type === type;
  });
}

function hasComponents(screen: ScreenInfo, types: string[]): boolean {
  return types.every(t => hasComponent(screen, t));
}

function countComponents(screen: ScreenInfo, type: string): number {
  return screen.components.filter(c => c.type === type).length;
}

function hasText(screen: ScreenInfo, patterns: string[]): boolean {
  const allText = screen.textContent.join(' ').toLowerCase();
  return patterns.some(p => allText.includes(p.toLowerCase()));
}

// ============== MAIN CLASSIFICATION FUNCTION ==============

export function classifyScreen(screen: ScreenInfo): ScreenClassification {
  let bestMatch: { type: string; confidence: number; pattern: ScreenPattern } | null = null;

  for (const [screenType, pattern] of Object.entries(SCREEN_PATTERNS)) {
    const matchCount = pattern.signals.filter(signal => {
      try {
        return signal(screen);
      } catch {
        return false;
      }
    }).length;

    const confidence = matchCount / pattern.signals.length;

    if (confidence > 0.3 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = { type: screenType, confidence, pattern };
    }
  }

  if (!bestMatch) {
    return {
      type: 'unknown',
      purpose: 'Unable to determine screen purpose',
      expectedData: [],
      expectedExits: [],
      confidence: 0,
      missingElements: []
    };
  }

  // Check for missing elements
  const missingElements: MissingElement[] = [];
  for (const check of bestMatch.pattern.missingChecks) {
    try {
      if (!check.check(screen)) {
        missingElements.push({
          element: check.element,
          severity: check.severity,
          message: check.message
        });
      }
    } catch {
      // Skip failed checks
    }
  }

  return {
    type: bestMatch.type,
    purpose: bestMatch.pattern.purpose,
    expectedData: bestMatch.pattern.expectedData,
    expectedExits: bestMatch.pattern.expectedExits,
    confidence: bestMatch.confidence,
    missingElements
  };
}

export const SCREEN_TYPES = Object.keys(SCREEN_PATTERNS);
