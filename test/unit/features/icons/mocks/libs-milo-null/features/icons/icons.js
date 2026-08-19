// Simulates Milo's real fetchIcons() behavior on a failed/404 sprite fetch — resolves to
// `null`, not a thrown error (see milo/libs/features/icons/icons.js's getSVGsfromFile).
export function fetchIcons() {
  return Promise.resolve(null);
}
