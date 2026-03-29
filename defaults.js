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
 * Secret key name used with ST's secrets system for the user's personal
 * Pollinations token. Never stored in extension_settings.
 */
export const POLLINATIONS_SECRET_KEY = 'localyze_pollinations_key'

export const DEFAULT_BOOLEAN_PROMPT =
`Current location: {{current_location}}.
Has the location changed in this message? Reply YES or NO only.

Message:
{{message}}`

export const DEFAULT_CLASSIFIER_PROMPT =
`Which of these location keys does this message take place in?
Reply with the exact key or NULL if none match.
Keys: {{key_list}}

Message:
{{message}}`

export const DEFAULT_DESCRIBER_PROMPT =
`Describe the location in this scene.
Reply as JSON only, no markdown fences:
{"name":"","key":"","description":"","imagePrompt":""}
key must be lowercase_slug. imagePrompt must be landscape orientation.

Context:
{{context}}`
