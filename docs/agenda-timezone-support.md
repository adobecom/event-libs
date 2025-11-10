# Agenda Timezone Support

## Overview

The event agenda block now supports timezone-aware time display, ensuring that agenda times are shown in the user's local timezone, matching the behavior of the `[[user-event-date-time-range]]` placeholder.

## Problem

Previously, agenda times were stored and displayed as simple time strings (e.g., "09:00:00") without timezone conversion. This meant:
- Times were displayed in the event's local timezone, not the user's timezone
- Users in different timezones would see incorrect times
- This was inconsistent with the `[[user-event-date-time-range]]` feature which properly converts to user's local time

## Solution

### How It Works

The system now uses **three pieces of information** together:
1. **`startTime`** in agenda items (e.g., "09:00:00")
2. **`timezone`** metadata (e.g., "America/Los_Angeles") - tells us what timezone the startTime is in
3. **`local-start-time-millis`** metadata - provides the event date

These are combined to convert the agenda time from the event's timezone to the user's local timezone.

### Example

**Metadata:**
```
timezone: America/Los_Angeles
local-start-time-millis: 1736931600000
```

**Agenda Data:**
```json
{
  "agenda": [
    {
      "startTime": "09:00:00",
      "title": "Opening Keynote",
      "description": "Welcome and introduction"
    }
  ]
}
```

### Behavior

1. **With `timezone` metadata**: Agenda times are converted from event timezone to user's local timezone
2. **Without `timezone` metadata**: Falls back to legacy behavior (no timezone conversion)
3. **DST-aware**: Automatically handles daylight saving time transitions

## Implementation Details

### New Function: `convertEventTimeToLocalTime`

```javascript
export function convertEventTimeToLocalTime(time, eventTimezone, eventDateMillis, locale)
```

**Parameters:**
- `time`: Time string in HH:MM:SS format (e.g., "09:00:00")
- `eventTimezone`: IANA timezone identifier (e.g., "America/Los_Angeles")
- `eventDateMillis`: Event date in milliseconds (from `local-start-time-millis` metadata)
- `locale`: Locale string for formatting (e.g., "en-US")

**Returns:** Formatted time string in user's local timezone (e.g., "9:00 AM")

**Features:**
- Converts times from event timezone to user's local timezone
- Handles DST transitions correctly
- Includes comprehensive error handling

### Legacy Function: `convertToLocaleTimeFormat`

- Still supported for backward compatibility
- Used when `timezone` metadata is not available
- Does NOT handle timezone conversion

## Usage for Content Authors

### Creating Agenda Items with Timezone Support

1. **Set the timezone metadata** for your event (e.g., "America/Los_Angeles")
2. **Use normal time strings** in agenda items (e.g., "09:00:00")
3. The block automatically converts to each user's local timezone

### Example

If your event is in Los Angeles (PST/PDT) starting at 9:00 AM:

**Metadata:**
```
timezone: America/Los_Angeles
local-start-time-millis: 1736931600000
```

**Agenda:**
```json
{
  "agenda": [
    {
      "startTime": "09:00:00",
      "title": "Opening Keynote"
    }
  ]
}
```

**Display:**
- User in Los Angeles sees: "9:00 AM"
- User in New York sees: "12:00 PM"
- User in London sees: "5:00 PM"

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

No migration required:
- Events without `timezone` metadata continue to work with legacy behavior
- Agenda times display as-is without timezone conversion

### For New Events  

Simply add the `timezone` metadata field:
```
timezone: America/Los_Angeles
```

Agenda items remain unchanged - just use `startTime` as before:
```json
{
  "startTime": "09:00:00",
  "title": "Session Title"
}
```

## Related Features

- `[[user-event-date-time-range]]` - Event date/time placeholder with timezone support
- `date-time-helper.js` - Shared timezone conversion utilities
- Event metadata system - Timezone configuration

## See Also

- [Date Time Formatting Guide](./date-time-formatting-guide.md)
- [Event Metadata Documentation](../README.md)

