// Appends a surface/location to a daa-ll label so analytics can tell the same control apart
// across placements (e.g. Add-to-Favorites-Upcoming). No suffix keeps the base label unchanged.
export function withDaaLlSuffix(label, suffix) {
  return suffix ? `${label}-${suffix}` : label;
}
