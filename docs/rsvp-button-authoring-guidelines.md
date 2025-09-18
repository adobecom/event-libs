# RSVP Button Authoring Guidelines

## Overview

RSVP buttons in the event-libs system are automatically processed and enhanced by the `decorateEvent` function. These buttons provide dynamic registration functionality with multiple states based on user authentication, event capacity, and registration status.

## Required Metadata

Before creating RSVP buttons, ensure the following metadata is set in your page's `<head>` section:

### Essential Metadata
```html
<meta name="event-id" content="your-event-id-here">
```

### Optional Metadata
```html
<!-- Enable waitlisting when event is full -->
<meta name="allow-wait-listing" content="true">

<!-- Allow guest users to register without signing in -->
<meta name="allow-guest-registration" content="true">
```

## Supported RSVP Button Types

### 1. Standard RSVP Form Button
**Hash Pattern:** `#rsvp-form`

**HTML Structure:**
```html
<a href="#rsvp-form">Register Now</a>
```

**Features:**
- Full registration functionality
- Dynamic state management
- User authentication handling
- Event capacity checking
- Waitlist support

### 2. Webinar Marketo Form Button
**Hash Pattern:** `#webinar-marketo-form`

**HTML Structure:**
```html
<a href="#webinar-marketo-form">Join Webinar</a>
```

**Features:**
- Simplified webinar registration
- Marketo form integration
- Basic registered state handling

## Button States and Behavior

The system automatically manages the following button states:

### 1. Loading State
- **Trigger:** Initial page load
- **Text:** Retrieved from dictionary (`rsvp-loading-cta-text`)
- **Appearance:** Disabled with loading text
- **Accessibility:** `tabindex="-1"`

### 2. Default State
- **Trigger:** Event has capacity and user not registered
- **Text:** Original button text
- **Appearance:** Enabled, clickable
- **Accessibility:** `tabindex="0"`

### 3. Registered State
- **Trigger:** User is already registered
- **Text:** Retrieved from dictionary (`registered-cta-text`)
- **Appearance:** Enabled with check icon
- **Accessibility:** `tabindex="0"`

### 4. Waitlisted State
- **Trigger:** User is on waitlist
- **Text:** Retrieved from dictionary (`waitlisted-cta-text`)
- **Appearance:** Enabled with check icon
- **Accessibility:** `tabindex="0"`

### 5. To Waitlist State
- **Trigger:** Event is full but waitlisting is enabled
- **Text:** Retrieved from dictionary (`waitlist-cta-text`)
- **Appearance:** Enabled, no icon
- **Accessibility:** `tabindex="0"`

### 6. Event Closed State
- **Trigger:** Event is full and waitlisting is disabled
- **Text:** Retrieved from dictionary (`event-full-cta-text`)
- **Appearance:** Disabled
- **Accessibility:** `tabindex="-1"`

## Text Configuration

Button text is managed through the dictionary system. The following keys are used:

- `rsvp-loading-cta-text` - Loading state text
- `registered-cta-text` - Already registered text
- `waitlisted-cta-text` - On waitlist text
- `waitlist-cta-text` - Join waitlist text
- `event-full-cta-text` - Event full text

## User Authentication Handling

### Guest Users
- If `allow-guest-registration` is `true`: Guest users can register directly
- If `allow-guest-registration` is `false`: Guest users are prompted to sign in

### Authenticated Users
- Users with valid Adobe accounts can register directly
- Registration status is tracked and displayed

## Advanced Features

### Custom Button Text with Fallback
You can provide custom text with a fallback using the pipe (`|`) separator:

```html
<a href="#rsvp-form">Custom Text|Fallback Text</a>
```

The system will use the text before the pipe as the original text, and the text after the pipe as a fallback.

### Analytics Integration
All RSVP buttons automatically include analytics tracking via the `daa-ll` attribute, which is updated based on the current button state.

## Best Practices

### 1. Button Placement
- Place RSVP buttons prominently on the page
- Ensure they're visible above the fold when possible
- Use clear, action-oriented text

### 2. Accessibility
- The system automatically handles `tabindex` attributes
- Ensure sufficient color contrast for disabled states
- Test with screen readers

### 3. Error Handling
- The system gracefully handles missing metadata
- Failed API calls don't break the page
- Users see appropriate fallback states

### 4. Performance
- Buttons are processed asynchronously
- No blocking operations during page load
- Efficient state management with event subscriptions

## Common Issues and Solutions

### Button Not Working
1. Verify `event-id` metadata is present
2. Check that the hash pattern matches exactly (`#rsvp-form` or `#webinar-marketo-form`)
3. Ensure the link has `href` attribute with the correct hash

### Wrong Button State
1. Check event capacity settings
2. Verify user authentication status
3. Confirm waitlist configuration

### Missing Text
1. Ensure dictionary keys are properly configured
2. Check for typos in dictionary key names
3. Verify dictionary initialization

## Example Implementation

```html
<!DOCTYPE html>
<html>
<head>
    <meta name="event-id" content="example-event-123">
    <meta name="allow-wait-listing" content="true">
    <meta name="allow-guest-registration" content="true">
</head>
<body>
    <!-- Standard RSVP button -->
    <a href="#rsvp-form" class="button primary">Register for Event</a>
    
    <!-- Webinar button -->
    <a href="#webinar-marketo-form" class="button secondary">Join Webinar</a>
    
    <!-- Custom text with fallback -->
    <a href="#rsvp-form" class="button">Secure Your Spot|Register Now</a>
</body>
</html>
```

## Technical Notes

- RSVP buttons are processed by the `processLinks` function within `decorateEvent`
- State management uses the BlockMediator for real-time updates
- Event capacity is checked via the ESP (Event Service Platform) API
- User profiles are managed through Adobe IMS integration
- All button states are reactive and update automatically based on user actions and event changes
