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
3. **`local-start-time-millis`** metadata - provides the event date and DST context

These are combined to convert the agenda time from the event's timezone to the user's local timezone.

**Important:** Agenda times are interpreted using the **DST rules in effect on the event date** (from `local-start-time-millis`), matching the behavior of `[[user-event-date-time-range]]`. When an author enters "17:30:00", they mean "5:30 PM in the event's local timezone on the event date", regardless of when the event was created.

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

**How it works:**
- The `startTime` "09:00:00" is interpreted as 9:00 AM in `America/Los_Angeles` timezone on the event date
- The DST rules used are those in effect on the event date (from `local-start-time-millis`)
- This time is then converted to the user's local timezone for display

### Behavior

1. **With `timezone` metadata**: Agenda times are converted from event timezone to user's local timezone
2. **Without `timezone` metadata**: Falls back to legacy behavior (no timezone conversion)
3. **DST-aware**: Automatically handles daylight saving time transitions

## Implementation Details

### Main Function: `convertEventTimeToLocalTime`

```javascript
convertEventTimeToLocalTime(time, eventTimezone, eventDateMillis, locale)
```

**Parameters:**
- `time`: Time in HH:MM:SS format (e.g., "09:00:00")
- `eventTimezone`: IANA timezone (e.g., "America/Los_Angeles")
- `eventDateMillis`: Event date (milliseconds or ISO string) for DST context
- `locale`: Locale for formatting (e.g., "en-US")

**Returns:** Formatted time in user's local timezone (e.g., "9:00 AM")

**Algorithm:**
Uses iterative refinement to find the correct UTC timestamp that represents the desired local time in the event timezone. This approach leverages the browser's timezone database for accurate DST handling, typically converging in 1-2 iterations.

### Fallback Function: `convertToLocaleTimeFormat`

Formats time without timezone conversion when timezone metadata is unavailable, maintaining backward compatibility.

## Usage for Content Authors

### Creating Timezone-Aware Agenda Items

1. Set the `timezone` metadata for your event (e.g., "America/Los_Angeles")
2. Use standard time strings in agenda items (e.g., "09:00:00")
3. Times automatically convert to each user's local timezone

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

### DST Handling Example

**Scenario:** Event in December 2025 (PST), created in October 2025 (PDT)

**Metadata:**
```
timezone: America/Los_Angeles
local-start-time-millis: 1733356800000  // December 4, 2025
```

**Agenda:**
```json
{ "startTime": "17:30:00" }  // 5:30 PM on event date
```

**How it works:**
- System uses event date (December) to determine DST context
- December in LA is PST (UTC-8)
- Interprets "17:30:00" as 5:30 PM PST
- User in EST sees: 8:30 PM EST

**Key Point:** Agenda times use the event date's DST rules, not the creation date's rules. This matches how `[[user-event-date-time-range]]` works.

### Benefits

- **Automatic localization**: Users see times in their timezone
- **Consistent with event times**: Agenda uses same DST context as `[[user-event-date-time-range]]`
- **Backward compatible**: Existing agendas continue to work
- **DST aware**: Correctly handles DST by using event date, not creation date

## Technical Notes

- Uses browser's native `Date` API and timezone database
- Same DST behavior as `[[user-event-date-time-range]]` (both use event date for DST context)
- Agenda times represent local time in event timezone on event date
- Supports millisecond timestamps and ISO date strings
- Locale-aware formatting via `toLocaleTimeString()`
- Error handling prevents crashes from invalid data

## Migration

**Existing Events:** No migration needed. Events without `timezone` metadata continue using legacy behavior (no conversion).

**New Events:** Add the `timezone` metadata field:
```
timezone: America/Los_Angeles
```

Agenda items remain unchanged:
```json
{ "startTime": "09:00:00", "title": "Session Title" }
```

## Related Features

- `[[user-event-date-time-range]]` - Event date/time placeholder with timezone support
- `date-time-helper.js` - Shared timezone conversion utilities
- Event metadata system - Timezone configuration

## See Also

- [Date Time Formatting Guide](./date-time-formatting-guide.md)
- [Event Metadata Documentation](../README.md)

