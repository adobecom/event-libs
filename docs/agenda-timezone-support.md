# Agenda Timezone Support

## Overview

The event agenda block now supports timezone-aware time display, ensuring that agenda times are shown in the user's local timezone, matching the behavior of the `[[user-event-date-time-range]]` placeholder.

## Problem

Previously, agenda times were stored and displayed as simple time strings (e.g., "09:00:00") without timezone conversion. This meant:
- Times were displayed in the event's local timezone, not the user's timezone
- Users in different timezones would see incorrect times
- This was inconsistent with the `[[user-event-date-time-range]]` feature which properly converts to user's local time

## Solution

### New Field: `startTimeMillis`

Agenda items can now include a `startTimeMillis` field containing a UTC timestamp in milliseconds. When present, this timestamp is automatically converted to the user's local timezone for display.

### Example

```json
{
  "agenda": [
    {
      "startTimeMillis": 1736931600000,  // UTC timestamp
      "startTime": "09:00:00",           // Fallback for backward compatibility
      "title": "Opening Keynote",
      "description": "Welcome and introduction"
    }
  ]
}
```

### Behavior

1. **With `startTimeMillis`**: Time is converted to user's local timezone
2. **Without `startTimeMillis`**: Falls back to `startTime` (legacy behavior, no timezone conversion)
3. **Both present**: `startTimeMillis` takes precedence

## Implementation Details

### New Function: `convertUtcToLocalTime`

```javascript
export function convertUtcToLocalTime(timestamp, locale)
```

- Converts UTC timestamps to user's local time
- Handles timezone offsets automatically
- Returns formatted time string (e.g., "9:00 AM")
- Includes error handling for invalid timestamps

### Modified Function: `convertToLocaleTimeFormat`

- Marked as legacy
- Still supported for backward compatibility
- Does NOT handle timezone conversion

## Usage for Content Authors

### Creating Agenda Items with Timezone Support

1. Store event times as UTC timestamps in milliseconds
2. Add both `startTimeMillis` (new) and `startTime` (legacy) fields
3. The block will automatically display times in each user's local timezone

### Example Conversion

If your event starts at 9:00 AM PST (UTC-8):
- Convert to UTC: 9:00 AM PST = 5:00 PM UTC
- Calculate timestamp: January 15, 2025, 5:00 PM UTC = 1736960400000
- Use in agenda: `"startTimeMillis": 1736960400000`

### Benefits

- **Automatic localization**: Users see times in their timezone
- **Consistency**: Matches behavior of event date-time ranges
- **Backward compatible**: Existing agendas continue to work
- **DST aware**: Automatically handles daylight saving time transitions

## Technical Notes

- Uses browser's `Date` API for timezone detection
- Follows same pattern as `user-event-date-time-range` implementation
- Locale-aware formatting via `toLocaleTimeString()`
- Error handling prevents crashes from invalid timestamps

## Migration Path

### For Existing Events

No migration required - existing agendas with only `startTime` continue to work.

### For New Events

Recommended to include both fields:
```json
{
  "startTimeMillis": 1736931600000,  // Primary (timezone-aware)
  "startTime": "09:00:00"            // Fallback (backward compatible)
}
```

## Related Features

- `[[user-event-date-time-range]]` - Event date/time placeholder with timezone support
- `date-time-helper.js` - Shared timezone conversion utilities
- Event metadata system - Timezone configuration

## See Also

- [Date Time Formatting Guide](./date-time-formatting-guide.md)
- [Event Metadata Documentation](../README.md)

