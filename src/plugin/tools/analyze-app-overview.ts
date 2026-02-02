/**
 * Tool: analyze_app_overview
 * Get high-level understanding of the entire app
 */

import { getAllScreens } from './get-all-screens';
import { detectDataCollection } from './detect-data-collection';
import { mapUserFlows } from './map-user-flows';

export interface AppOverview {
  appType: string;
  appTypeConfidence: number;
  description: string;
  stats: {
    totalScreens: number;
    totalFlows: number;
    deadEnds: number;
    orphanScreens: number;
    dataPointsCollected: number;
  };
  mainFeatures: string[];
  userGoals: string[];
  dataCollectionSummary: string[];
  screenList: Array<{
    name: string;
    inferredPurpose: string;
  }>;
  criticalIssues: string[];
}

export function analyzeAppOverview(): AppOverview {
  const screens = getAllScreens();
  const dataReport = detectDataCollection();
  const flowMap = mapUserFlows(true);

  // Infer app type from screen names and data collected
  const allScreenNames = screens.map(s => s.name.toLowerCase()).join(' ');
  const { appType, confidence, description } = inferAppType(allScreenNames, dataReport.summary);

  // Extract main features from screen names
  const mainFeatures = extractMainFeatures(screens.map(s => s.name));

  // Infer user goals
  const userGoals = inferUserGoals(appType, mainFeatures, dataReport.summary);

  // Infer screen purposes
  const screenList = screens.map(s => ({
    name: s.name,
    inferredPurpose: inferScreenPurpose(s.name),
  }));

  // Critical issues
  const criticalIssues = [
    ...flowMap.issues.filter(i => i.severity === 'critical').map(i => i.message),
  ];

  if (dataReport.summary.sensitiveData.length > 0 && !allScreenNames.includes('privacy')) {
    criticalIssues.push('App collects sensitive data but may lack privacy policy screen');
  }

  return {
    appType,
    appTypeConfidence: confidence,
    description,
    stats: {
      totalScreens: screens.length,
      totalFlows: flowMap.flowGroups.length,
      deadEnds: flowMap.stats.deadEnds,
      orphanScreens: flowMap.stats.orphans,
      dataPointsCollected: dataReport.summary.totalInputs,
    },
    mainFeatures,
    userGoals,
    dataCollectionSummary: [
      ...dataReport.summary.personalData.map(d => `Collects: ${d}`),
      ...dataReport.summary.sensitiveData.map(d => `Sensitive: ${d}`),
    ],
    screenList,
    criticalIssues,
  };
}

function inferAppType(screenNames: string, dataSummary: { personalData: string[]; contentData: string[] }): {
  appType: string;
  confidence: number;
  description: string;
} {
  const types = [
    {
      type: 'mental_health',
      signals: ['mood', 'journal', 'meditation', 'breathing', 'therapy', 'cbt', 'anxiety', 'wellness'],
      description: 'Mental health & wellness application',
    },
    {
      type: 'ecommerce',
      signals: ['cart', 'checkout', 'product', 'shop', 'buy', 'order', 'payment'],
      description: 'E-commerce / shopping application',
    },
    {
      type: 'social',
      signals: ['feed', 'post', 'comment', 'follow', 'profile', 'message', 'chat', 'friend'],
      description: 'Social networking application',
    },
    {
      type: 'saas',
      signals: ['dashboard', 'analytics', 'report', 'workspace', 'project', 'team', 'admin'],
      description: 'SaaS / productivity application',
    },
    {
      type: 'fitness',
      signals: ['workout', 'exercise', 'run', 'gym', 'calories', 'step', 'activity', 'health'],
      description: 'Fitness & health tracking application',
    },
    {
      type: 'education',
      signals: ['course', 'lesson', 'quiz', 'learn', 'study', 'class', 'module', 'progress'],
      description: 'Educational / learning application',
    },
    {
      type: 'finance',
      signals: ['balance', 'transaction', 'transfer', 'budget', 'expense', 'account', 'bank'],
      description: 'Finance / banking application',
    },
  ];

  let bestMatch = { appType: 'general', confidence: 0, description: 'General purpose application' };

  for (const typeInfo of types) {
    const matchCount = typeInfo.signals.filter(signal => screenNames.includes(signal)).length;
    const confidence = matchCount / typeInfo.signals.length;

    if (confidence > bestMatch.confidence) {
      bestMatch = { appType: typeInfo.type, confidence, description: typeInfo.description };
    }
  }

  // Boost confidence with data collection signals
  if (bestMatch.appType === 'mental_health' && dataSummary.contentData.includes('mood_data')) {
    bestMatch.confidence = Math.min(1, bestMatch.confidence + 0.2);
  }
  if (bestMatch.appType === 'ecommerce' && dataSummary.personalData.includes('payment_info')) {
    bestMatch.confidence = Math.min(1, bestMatch.confidence + 0.2);
  }

  return bestMatch;
}

function extractMainFeatures(screenNames: string[]): string[] {
  const features: string[] = [];
  const namesJoined = screenNames.join(' ').toLowerCase();

  const featurePatterns = [
    { pattern: /login|sign.?in/i, feature: 'User authentication' },
    { pattern: /signup|register/i, feature: 'User registration' },
    { pattern: /profile/i, feature: 'User profiles' },
    { pattern: /settings/i, feature: 'Settings management' },
    { pattern: /search/i, feature: 'Search functionality' },
    { pattern: /notification/i, feature: 'Notifications' },
    { pattern: /chat|message/i, feature: 'Messaging' },
    { pattern: /dashboard/i, feature: 'Dashboard/overview' },
    { pattern: /list|feed|browse/i, feature: 'Content browsing' },
    { pattern: /detail|view/i, feature: 'Detail views' },
    { pattern: /cart|checkout/i, feature: 'Shopping cart' },
    { pattern: /journal|diary/i, feature: 'Journaling' },
    { pattern: /mood|emotion/i, feature: 'Mood tracking' },
    { pattern: /exercise|activity/i, feature: 'Guided exercises' },
    { pattern: /onboarding|welcome/i, feature: 'Onboarding flow' },
  ];

  for (const { pattern, feature } of featurePatterns) {
    if (pattern.test(namesJoined)) {
      features.push(feature);
    }
  }

  return features.length > 0 ? features : ['Core functionality'];
}

function inferUserGoals(appType: string, features: string[], dataSummary: { personalData: string[] }): string[] {
  const goals: string[] = [];

  switch (appType) {
    case 'mental_health':
      goals.push('Track emotional wellbeing');
      if (features.includes('Journaling')) goals.push('Reflect through writing');
      if (features.includes('Guided exercises')) goals.push('Practice coping techniques');
      break;

    case 'ecommerce':
      goals.push('Browse and purchase products');
      goals.push('Manage orders');
      if (features.includes('Search functionality')) goals.push('Find specific items');
      break;

    case 'social':
      goals.push('Connect with others');
      goals.push('Share content');
      if (features.includes('Messaging')) goals.push('Communicate privately');
      break;

    case 'saas':
      goals.push('Manage work/projects');
      if (features.includes('Dashboard/overview')) goals.push('Monitor progress');
      break;

    default:
      if (features.includes('User authentication')) goals.push('Access personalized content');
      if (features.includes('Content browsing')) goals.push('Discover and explore content');
  }

  return goals.length > 0 ? goals : ['Accomplish tasks efficiently'];
}

function inferScreenPurpose(screenName: string): string {
  const name = screenName.toLowerCase();

  if (/login|sign.?in/i.test(name)) return 'Authenticate returning users';
  if (/signup|register/i.test(name)) return 'Register new users';
  if (/forgot|reset/i.test(name)) return 'Password recovery';
  if (/onboarding|welcome/i.test(name)) return 'Guide new users';
  if (/dashboard|home/i.test(name)) return 'Main hub/overview';
  if (/settings/i.test(name)) return 'User preferences';
  if (/profile/i.test(name)) return 'User profile management';
  if (/list|feed|browse/i.test(name)) return 'Content discovery';
  if (/detail|view/i.test(name)) return 'Detailed content view';
  if (/cart/i.test(name)) return 'Shopping cart';
  if (/checkout/i.test(name)) return 'Complete purchase';
  if (/journal/i.test(name)) return 'Personal reflection';
  if (/mood/i.test(name)) return 'Emotional check-in';
  if (/exercise|activity/i.test(name)) return 'Guided activity';
  if (/success|confirm/i.test(name)) return 'Confirmation';
  if (/error/i.test(name)) return 'Error handling';

  return 'App functionality';
}
