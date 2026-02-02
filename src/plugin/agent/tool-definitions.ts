/**
 * Tool definitions for Claude's tool-use feature
 * These define what tools the agent can call
 */

export const TOOL_DEFINITIONS = [
  {
    name: 'get_all_screens',
    description: `Get all screens/frames in the current Figma page.
Returns an array of screens with their names, IDs, sizes, and basic metadata.
Use this first to understand the scope of the design.`,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[]
    }
  },

  {
    name: 'get_screen_details',
    description: `Get detailed information about a specific screen.
Returns the full node tree, all children, text content, and styles.
Use this to deep-dive into a specific screen after getting the overview.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        screenId: {
          type: 'string',
          description: 'The ID of the screen to analyze'
        }
      },
      required: ['screenId']
    }
  },

  {
    name: 'classify_screen_components',
    description: `Analyze all components on a screen and classify them.
Returns components classified as: buttons (primary/secondary/destructive),
inputs (email/password/phone/name/search), navigation (tabBar/topNav/sidebar),
cards, modals, lists, toasts, error states, success states, loading states.
Each component includes its type, subtype, meaning, and any data it might collect.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        screenId: {
          type: 'string',
          description: 'The ID of the screen to classify'
        }
      },
      required: ['screenId']
    }
  },

  {
    name: 'analyze_screen_purpose',
    description: `Determine what a screen is FOR.
Returns: screen type (login, signup, dashboard, settings, checkout, etc.),
purpose description, expected data collection, expected exits, and any missing elements.
Uses pattern matching against known screen types.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        screenId: {
          type: 'string',
          description: 'The ID of the screen to analyze'
        }
      },
      required: ['screenId']
    }
  },

  {
    name: 'map_user_flows',
    description: `Map all possible user journeys through the app.
Analyzes prototype links and navigation to determine:
- Happy path (main user journey)
- Alternative paths
- Dead ends (screens with no exit)
- Orphan screens (unreachable screens)
- Missing connections`,
    input_schema: {
      type: 'object' as const,
      properties: {
        includePrototypeLinks: {
          type: 'boolean',
          description: 'Include Figma prototype connections (default: true)'
        }
      },
      required: [] as string[]
    }
  },

  {
    name: 'detect_data_collection',
    description: `Find all points where the app collects user data.
Returns: all input fields, what data they collect (email, password, phone, name, etc.),
which screens collect data, and a summary of the app's data footprint.`,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[]
    }
  },

  {
    name: 'critique_ux',
    description: `Apply UX heuristics to find issues.
Checks against Nielsen's 10 heuristics, accessibility guidelines (WCAG basics),
and common UX patterns. Returns issues ranked by severity (critical, warning, info).
Can apply domain-specific checks for mental_health, ecommerce, or saas apps.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        screenId: {
          type: 'string',
          description: 'Specific screen to critique (optional - analyzes all if not provided)'
        },
        domain: {
          type: 'string',
          enum: ['general', 'mental_health', 'ecommerce', 'saas'],
          description: 'App domain for specialized checks'
        }
      },
      required: [] as string[]
    }
  },

  {
    name: 'analyze_app_overview',
    description: `Get a high-level understanding of the entire app.
Returns: inferred app type, main features, user goals, data collected summary,
screen count, and flow summary.
Use this to understand what the app IS before diving into details.`,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[]
    }
  }
];

export type ToolName = typeof TOOL_DEFINITIONS[number]['name'];
