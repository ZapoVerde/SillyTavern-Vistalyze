/**
 * @file data/default-user/extensions/localyze/defaults.js
 * @stamp {"utc":"2026-03-31T06:21:00.000Z"}
 * @version 1.2.0
 * @architectural-role Default Configuration
 * @description
 * Default prompt strings and API constants for Localyze.
 * 
 * Version 1.2.0 Updates:
 * - Added DEFAULT_DESCRIBER_HISTORY constant for Step 3 context tuning.
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
 * Requests to this domain are routed through enter.pollinations.ai for
 * authentication (Authorization: Bearer) and billing.
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
 */
export const DEFAULT_IMAGE_PROMPT_TEMPLATE = '{{description}}, landscape, cinematic lighting, detailed environment'

/**
 * Dev mode — generates recognizable but low-cost images.
 * Balanced at 320x180 for visibility without high credit consumption.
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
`Which of these location keys does this message take place in?
Reply with the exact key or NULL if none match.
Keys: {{key_list}}

{{history}}Message:
{{message}}`

export const DEFAULT_DESCRIBER_PROMPT =
`[SYSTEM: TASK — LOCATION IDENTIFIER]
You are reading a roleplay transcript and identifying the physical location of the current scene.
Your job is to name the location, assign it a stable key, and write a vivid atmospheric description
suitable for generating a background image.

TRANSCRIPT:
{{context}}

INSTRUCTIONS:
- Identify the single most specific location active at the end of the transcript.
- name: A short human-readable label (e.g. "Throne Room", "Rainy Dockside Street").
- key: A lowercase_slug version of the name, unique and stable (e.g. "throne_room", "rainy_dockside_street").
- description: 2–3 sentences. Capture the visual atmosphere — lighting, mood, key architectural or
  environmental details. Write as if directing a scene painter, not narrating plot.
- If the location cannot be determined from the transcript, output exactly: NULL

### OUTPUT FORMAT — JSON only, no markdown fences, no other text:
{"name":"","key":"","description":""}`