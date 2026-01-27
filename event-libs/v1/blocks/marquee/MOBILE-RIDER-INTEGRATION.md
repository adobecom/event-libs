# Mobile-Rider Player Integration for Marquee Block

## Overview
This document outlines the recommended approach for adding mobile-rider player support to the marquee block, following the same pattern used for AdobeTV and YouTube video players.

## Current Implementation Pattern

Looking at the marquee.js code:
1. **Video Detection**: The `decorateSplit` function checks for video content using:
   - Text matching `http.*\.mp4` pattern
   - `VIDEO` tags
   - `.video-holder video` elements

2. **AutoBlocks**: AdobeTV and YouTube are handled through Milo's autoBlocks system (configured in event-config.js), which automatically converts matching URLs into their respective blocks.

## Recommended Approach

### Option 1: AutoBlocks Configuration (Recommended - Similar to AdobeTV/YouTube)

**Pros:**
- Consistent with existing AdobeTV/YouTube implementation
- Automatic detection and conversion
- No code changes needed in marquee.js
- Works across all blocks, not just marquee

**Implementation:**
Add to `event-config.js` autoBlocks configuration:
```javascript
{
  "mobile-rider": "mobilerider.com"
}
```

Then create a `mobile-rider` block handler that can be embedded in marquee (or any block).

### Option 2: Direct Detection in Marquee (More Control)

**Pros:**
- Full control over detection logic
- Can customize behavior specifically for marquee
- Can extract parameters from various URL formats

**Implementation Steps:**

1. **Add detection function** in marquee.js:
```javascript
function detectMobileRider(urlOrElement) {
  // Check for mobilerider.com URLs
  // Check for data attributes
  // Check for custom URL schemes
  // Return { videoId, skinId, aslId } or null
}
```

2. **Modify `decorateSplit` function**:
```javascript
function decorateSplit(el, foreground, media) {
  // ... existing code ...
  
  // Check for mobile-rider BEFORE video detection
  const mobileRiderConfig = detectMobileRider(media);
  if (mobileRiderConfig?.videoId) {
    const mobileRiderEl = createMobileRiderBlock(mobileRiderConfig);
    media.replaceWith(mobileRiderEl);
    loadMobileRiderPlayer(mobileRiderEl);
    return; // Exit early
  }
  
  // ... rest of existing video detection ...
}
```

3. **Or add check in `init` function** before `decorateImage`:
```javascript
if (media) {
  // Check for mobile-rider first
  if (checkAndLoadMobileRider(media)) {
    // Mobile-rider loaded, skip image decoration
  } else if (!media.querySelector('video, a[href*=".mp4"]')) {
    decorateImage(media);
  }
}
```

## URL Detection Patterns

The mobile-rider player can be detected from:

1. **Direct URLs:**
   - `https://assets.mobilerider.com/...?videoId=123&skinId=456`
   - `mobile-rider://videoId=123&skinId=456`

2. **Data Attributes:**
   ```html
   <div data-videoid="123" data-skinid="456" data-aslid="789">
   ```

3. **Link Text/URLs:**
   - Links containing `mobilerider.com`
   - Text content matching mobile-rider patterns

## Mobile-Rider Block Structure

The mobile-rider block expects this structure:
```html
<div class="mobile-rider">
  <div>
    <div>videoid</div>
    <div>123</div>
  </div>
  <div>
    <div>skinid</div>
    <div>456</div>
  </div>
  <div>
    <div>aslid</div>
    <div>789</div>
  </div>
</div>
```

## Integration Example

See `marquee-suggestion.js` for complete implementation examples including:
- `detectMobileRider()` - Detection function
- `createMobileRiderBlock()` - Block structure creation
- `loadMobileRiderPlayer()` - Async module loading
- Modified `decorateSplit()` - Integration point

## Best Practice Recommendation

**Use Option 1 (AutoBlocks)** if:
- You want consistency with AdobeTV/YouTube
- Mobile-rider should work in other blocks too
- You prefer automatic URL-based detection

**Use Option 2 (Direct Detection)** if:
- You need custom detection logic
- You want marquee-specific behavior
- You need to extract parameters from non-standard URLs

## Testing Checklist

- [ ] Mobile-rider URL detection works
- [ ] Block structure is created correctly
- [ ] Player initializes successfully
- [ ] Works with existing video/image logic
- [ ] Doesn't break AdobeTV/YouTube support
- [ ] Handles missing parameters gracefully
- [ ] Error handling/logging works














