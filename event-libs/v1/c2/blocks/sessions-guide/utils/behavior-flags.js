// behaviorFlags default to enabled — only an explicit `false` from the Session Guide
// Configurator turns a CTA off, so pages/tests with no authored config behave as before.
export function isBehaviorEnabled(guideConfig, flag) {
  return guideConfig?.behaviorFlags?.[flag] !== false;
}
