/**
 * @file data/default-user/extensions/localyze/defaults.js
 * @stamp {"utc":"2026-04-01T23:10:00.000Z"}
 * @architectural-role Default Configuration
 * @description
 * Default prompt strings and API constants for Localyze.
 * 
 * @updates
 * - Added DEFAULT_DISCOVERY_PROMPT for targeted keyword-based generation.
 * - Added DEFAULT_DISCOVERY_HISTORY turns.
 *
 * @api-declaration
 * POLLINATIONS_BASE_URL
 * POLLINATIONS_APP_KEY
 * POLLINATIONS_MODELS
 * DEFAULT_IMAGE_MODEL
 * DEFAULT_IMAGE_PROMPT_TEMPLATE
 * DEFAULT_DEV_MODE
 * DEV_IMAGE_WIDTH
 * DEV_IMAGE_HEIGHT
 * DEFAULT_BOOLEAN_HISTORY
 * DEFAULT_CLASSIFIER_HISTORY
 * DEFAULT_DESCRIBER_HISTORY
 * DEFAULT_DISCOVERY_HISTORY
 * DEFAULT_BOOLEAN_PROMPT
 * DEFAULT_CLASSIFIER_PROMPT
 * DEFAULT_DESCRIBER_PROMPT
 * DEFAULT_DISCOVERY_PROMPT
 */

/** Primary API Gateway for Pollinations. */
export const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai'

/** Publishable app key — identifies Localyze to Pollinations for attribution. */
export const POLLINATIONS_APP_KEY = 'pk_WfuLORZ5RZDfPRZU'

/** Available Pollinations image models. */
export const POLLINATIONS_MODELS =[
    'flux',
    'zimage',
    'klein',
    'gptimage',
    'grok-imagine',
    'seedream',
    'qwen-image',
]

/** Default Pollinations model. */
export const DEFAULT_IMAGE_MODEL = 'flux'

/** Image prompt template. Interpolated by imageCache.js. */
export const DEFAULT_IMAGE_PROMPT_TEMPLATE = '{{image_prompt}}, landscape, cinematic lighting, detailed environment'

/** Dev mode — generates recognizable but low-cost images. */
export const DEFAULT_DEV_MODE = false

/** Parallax — horizontal panning effect on wide background images. Off by default. */
export const DEFAULT_PARALLAX_ENABLED = false
export const DEV_IMAGE_WIDTH  = 320
export const DEV_IMAGE_HEIGHT = 180

/** Default turn-pair history for LLM calls. */
export const DEFAULT_BOOLEAN_HISTORY = 3
export const DEFAULT_CLASSIFIER_HISTORY = 3
export const DEFAULT_DESCRIBER_HISTORY = 3
export const DEFAULT_DISCOVERY_HISTORY = 3

export const DEFAULT_BOOLEAN_PROMPT =
`Current scene: {{current_location}}

Previous turns:
{{history}}

Latest message:
{{message}}

Has the scene moved to a new named location since the previous turns? YES or NO.`

export const DEFAULT_CLASSIFIER_PROMPT =
`[SYSTEM: TASK — LOCATION CLASSIFIER]
Identify which location from the list below matches the current scene described in the message.

LOCATIONS:
{{key_list}}

TRANSITION HISTORY FROM CURRENT LOCATION:
{{spatial_transitions}}

{{history}}
LATEST MESSAGE:
{{message}}

INSTRUCTIONS:
1. Compare the message to the Name and Definition of each location.
2. If a match is found, reply with only the ID portion of the location (the text inside the brackets).
3. If no match is found, or if the scene is moving somewhere entirely new, reply with: NULL`

export const DEFAULT_DESCRIBER_PROMPT =
`[SYSTEM: TASK — LOCATION ARCHIVIST]
Analyze the roleplay transcript to identify the current physical location.

TRANSCRIPT:
{{context}}

INSTRUCTIONS:
1. Identify the single most specific active location at the end of the transcript.
2. Provide the information using the exact labels below:
   Name: A short, formal label (e.g., "The Silver Swan Tavern").
   Definition: A brief, conceptual definition of what this place is. This helps distinguish the location semantically for search logic.
   Visuals: 2-3 sentences of pure visual/sensory detail for an image generator. Focus on lighting, materials, and mood. Do not mention characters.

### OUTPUT FORMAT:
Name: [Location Name]
Definition: [Logical Definition]
Visuals: [Image Generation Prompt]`

export const DEFAULT_DISCOVERY_PROMPT =
`[SYSTEM: TASK — TARGETED LOCATION DISCOVERY]
Create a new location definition based on the user's keywords and the current roleplay context.

USER KEYWORDS: {{keywords}}

TRANSCRIPT CONTEXT:
{{context}}

INSTRUCTIONS:
1. Prioritize the USER KEYWORDS as the primary theme for the location.
2. Use the TRANSCRIPT CONTEXT to refine the mood and world-consistency.
3. Provide the information using the exact labels below:
   Name: A short, formal label based on the keywords.
   Definition: A brief, conceptual definition of what this place is.
   Visuals: 2-3 sentences of pure visual/sensory detail for an image generator. Focus on lighting and environment. No characters.

### OUTPUT FORMAT:
Name: [Location Name]
Definition: [Logical Definition]
Visuals: [Image Generation Prompt]`