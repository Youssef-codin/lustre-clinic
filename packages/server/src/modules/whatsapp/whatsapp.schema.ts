/**
 * No endpoint here takes input — the test recipient is `config.whatsapp
 * .testNumber`, deliberately not a field on the request. A desk that can type
 * any number into a send box is a desk that can message a patient by accident,
 * and the number is clinic setup rather than a per-click decision.
 *
 * Responses are `WhatsAppStatus` and `WhatsAppTestResult` in `@mawid/shared`;
 * the status shape is also what `whatsapp:status` pushes, so the desk screen
 * has one code path for both.
 */
export {};
