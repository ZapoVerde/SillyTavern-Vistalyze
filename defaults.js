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
export const DEFAULT_IMAGE_PROMPT_TEMPLATE = '{{image_prompt}}'

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
`Current location: {{current_location}}.
Has the location changed in this message? Reply YES or NO only.

{{history}}Message:
{{message}}`

/** Default number of turn-pairs passed as history to the classifier call. */
export const DEFAULT_CLASSIFIER_HISTORY = 3

export const DEFAULT_CLASSIFIER_PROMPT =
`Which of these location keys does this message take place in?
Reply with the exact key or NULL if none match.
Keys: {{key_list}}

{{history}}Message:
{{message}}`

export const DEFAULT_DESCRIBER_PROMPT =
`Describe the location in this scene.
Reply as JSON only, no markdown fences:
{"name":"","key":"","description":"","imagePrompt":""}
key must be lowercase_slug. imagePrompt must be landscape orientation.

Context:
{{context}}`
