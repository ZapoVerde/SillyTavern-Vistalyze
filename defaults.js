/**
 * @file data/default-user/extensions/localyze/defaults.js
 * @stamp {"utc":"2026-04-01T12:00:00.000Z"}
 * @version 1.3.0
 * @architectural-role Default Configuration
 * @description
 * Default prompt strings and API constants for Localyze.
 * 
 * Version 1.3.0 Updates:
 * - Refactored DESCRIBER prompt to use "Location Archivist" persona.
 * - Split location metadata into 'essence' (semantic) and 'atmosphere' (visual).
 * - Removed 'key' from LLM output requirements to favor programmatic slugging.
 * - Updated IMAGE_PROMPT_TEMPLATE to utilize the new 'atmosphere' field.
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
 * DEFAULT_BOOLEAN_PROMPT
 * DEFAULT_CLASSIFIER_PROMPT
 * DEFAULT_DESCRIBER_PROMPT
 */

/**
 * Primary API Gateway for Pollinations.
 */
export const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai'

/**
 * Publishable app key — identifies Localyze to Pollinations for attribution.
 */
export const POLLINATIONS_APP_KEY = 'pk_WfuLORZ5RZDfPRZU'

/**
 * Available Pollinations image models.
 */
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

/**
 * Image prompt template. Interpolated by imageCache.js.
 * Updated to use 'atmosphere' for focused visual generation.
 */
export const DEFAULT_IMAGE_PROMPT_TEMPLATE = '{{atmosphere}}, landscape, cinematic lighting, detailed environment'

/**
 * Dev mode — generates recognizable but low-cost images.
 */
export const DEFAULT_DEV_MODE = false
export const DEV_IMAGE_WIDTH  = 320
export const DEV_IMAGE_HEIGHT = 180

/** Default turn-pair history for LLM calls. */
export const DEFAULT_BOOLEAN_HISTORY = 3
export const DEFAULT_CLASSIFIER_HISTORY = 3
export const DEFAULT_DESCRIBER_HISTORY = 3

export const DEFAULT_BOOLEAN_PROMPT =
`Current scene: {{current_location}}

Previous turns:
{{history}}

Latest message:
{{message}}

Has the scene moved to a new named location since the previous turns? YES or NO.`

export const DEFAULT_CLASSIFIER_PROMPT =
`Which of these locations matches the latest message?
Reply with the exact Key or NULL.

Locations:
{{key_list}}

{{history}}
Message: {{message}}`

export const DEFAULT_DESCRIBER_PROMPT =
`[SYSTEM: TASK — LOCATION ARCHIVIST]
Analyze the roleplay transcript to identify the current physical location.

TRANSCRIPT:
{{context}}

INSTRUCTIONS:
1. Identify the single most specific active location at the end of the transcript.
2. name: A short, formal label (e.g., "The Silver Swan Tavern").
3. essence: A brief, conceptual definition of what this place IS (e.g., "A crowded medieval pub and inn"). This helps distinguish the location semantically.
4. atmosphere: 2-3 sentences of pure visual/sensory detail for an image generator. Focus on lighting, materials, and mood. Do not mention characters.

### OUTPUT FORMAT — JSON only, no markdown fences, no other text:
{"name": "", "essence": "", "atmosphere": ""}`