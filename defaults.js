/**
 * @file data/default-user/extensions/localyze/defaults.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Default Configuration
 * @description
 * Default prompt strings for the three Localyze LLM calls. Each prompt
 * uses {{placeholders}} that are interpolated by detector.js before the
 * call is dispatched.
 *
 * Placeholders:
 *   BOOLEAN:    {{current_location}}, {{message}}
 *   CLASSIFIER: {{key_list}}, {{message}}
 *   DESCRIBER:  {{context}}
 *
 * @api-declaration
 * DEFAULT_BOOLEAN_PROMPT
 * DEFAULT_CLASSIFIER_PROMPT
 * DEFAULT_DESCRIBER_PROMPT
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: []
 *     external_io: []
 */

/**
 * Referrer string sent with every Pollinations request.
 * Identifies Localyze to Pollinations for attribution and rate-limit tier.
 * Not a secret — hardcoded, not user-configurable.
 */
export const POLLINATIONS_REFERRER = 'pk_WfuLORZ5RZDfPRZU'

/**
 * Available Pollinations image models.
 * The user selects one in settings; stored in extension_settings.localyze.imageModel.
 */
export const POLLINATIONS_MODELS = ['flux', 'turbo', 'flux-realism', 'flux-anime', 'flux-3d', 'flux-cablyai']

/** Default Pollinations model. */
export const DEFAULT_IMAGE_MODEL = 'flux'

/**
 * Image prompt template. Interpolated by imageCache.js before the Pollinations
 * request is sent.
 *
 * Placeholders:
 *   {{image_prompt}}  — the raw imagePrompt from the location definition
 *   {{name}}          — human-readable location name
 *   {{description}}   — location description
 */
export const DEFAULT_IMAGE_PROMPT_TEMPLATE = '{{description}}, landscape, cinematic lighting, detailed environment'

/**
 * Dev mode — generates tiny placeholder images (64×36) instead of full 1920×1080.
 * Prevents burning through Pollinations credits during development.
 */
export const DEFAULT_DEV_MODE = false
export const DEV_IMAGE_WIDTH  = 64
export const DEV_IMAGE_HEIGHT = 36

/** Default number of turn-pairs (user + AI = 1 pair) passed as history to the boolean call. */
export const DEFAULT_BOOLEAN_HISTORY = 3

export const DEFAULT_BOOLEAN_PROMPT =
`Current scene: {{current_location}}

Previous turns:
{{history}}

Latest message:
{{message}}

Has the scene moved to a new named location since the previous turns? YES or NO.`

/** Default number of turn-pairs passed as history to the classifier call. */
export const DEFAULT_CLASSIFIER_HISTORY = 3

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
