# Video Playlist Block - High-Level Overview

## Overview
The **Video Playlist Block** is a component that displays a collection of videos in a playlist format, allowing users to browse, select, and play videos from a curated list. It provides an intuitive interface for managing multiple video content items, typically YouTube videos, with features like thumbnail previews, video navigation, and seamless playback.

## Key Features

### 1. **Playlist Management**
   - Displays multiple videos in a scrollable or grid-based playlist
   - Supports both horizontal and vertical playlist layouts
   - Configurable number of visible items
   - Responsive design for mobile, tablet, and desktop

### 2. **Video Player Integration**
   - Embedded video player (YouTube or other providers)
   - Lazy loading for performance optimization
   - Autoplay support (configurable)
   - Video controls (play, pause, volume, fullscreen)
   - Preconnect to video domains for faster loading

### 3. **Playlist Navigation**
   - Click/select a video from the playlist to switch playback
   - Visual indicators for currently playing video
   - Previous/Next navigation buttons
   - Keyboard navigation support (arrow keys, Enter)
   - Auto-advance to next video when current video ends (optional)

### 4. **Video Metadata Display**
   - Video thumbnails with hover effects
   - Video titles
   - Video duration
   - Video descriptions (optional)
   - Play/pause indicators

### 5. **User Experience Features**
   - Smooth transitions between videos
   - Loading states and placeholders
   - Error handling for failed video loads
   - Accessibility support (ARIA labels, keyboard navigation)
   - Mobile-optimized touch interactions

### 6. **Configuration Options**
   - **Playlist Source**: Define videos via metadata or block configuration
   - **Layout**: Horizontal or vertical playlist orientation
   - **Autoplay**: Enable/disable autoplay for first video
   - **Auto-advance**: Automatically play next video when current ends
   - **Show Thumbnails**: Toggle thumbnail display
   - **Show Titles**: Toggle title display
   - **Show Descriptions**: Toggle description display
   - **Player Controls**: Show/hide player controls
   - **Playlist Position**: Side panel, bottom bar, or overlay

## How It Works

### Initialization Flow
1. **Block Detection**: The block is identified in the DOM
2. **Configuration Reading**: Reads block configuration and metadata
3. **Data Parsing**: Parses video playlist data (from metadata or config)
4. **DOM Structure Creation**: Builds the playlist container and video player area
5. **Video Loading**: Loads first video (or placeholder if autoplay disabled)
6. **Playlist Rendering**: Renders video thumbnails and metadata
7. **Event Listeners**: Attaches click handlers and keyboard navigation

### Video Switching Flow
1. **User Selection**: User clicks on a video in the playlist
2. **State Update**: Updates active video indicator
3. **Player Update**: Swaps or updates the video player iframe/embed
4. **Playback Start**: Starts playing the selected video (if autoplay enabled)
5. **History Update**: Updates browser history (optional, for deep linking)

### Layout Structure
```
┌─────────────────────────────────────────┐
│         Video Player Area                │
│  ┌───────────────────────────────────┐   │
│  │                                   │   │
│  │      Active Video Player          │   │
│  │                                   │   │
│  └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│         Playlist Area                   │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│  │[▶]│ │    │ │    │ │    │ │    │    │
│  │V1 │ │ V2 │ │ V3 │ │ V4 │ │ V5 │    │
│  └────┘ └────┘ └────┘ └────┘ └────┘    │
└─────────────────────────────────────────┘
```

## Configuration Parameters

### Block Configuration (via metadata or block attributes)
- `playlist-source`: Source of playlist data (metadata, config, or URL)
- `layout`: `horizontal` | `vertical` | `grid`
- `autoplay`: `true` | `false`
- `auto-advance`: `true` | `false`
- `show-thumbnails`: `true` | `false`
- `show-titles`: `true` | `false`
- `show-descriptions`: `true` | `false`
- `player-controls`: `true` | `false`
- `playlist-position`: `side` | `bottom` | `overlay`
- `default-video`: Index or ID of default video to show

### Video Data Structure
Each video in the playlist should have:
```json
{
  "videoId": "youtube-video-id",
  "title": "Video Title",
  "description": "Video description (optional)",
  "thumbnail": "custom-thumbnail-url (optional)",
  "duration": "10:30 (optional)"
}
```

## Technical Implementation Highlights

### Performance Optimizations
- **Lazy Loading**: Videos load only when needed
- **Preconnect**: Preconnects to video domains (YouTube, etc.)
- **Thumbnail Caching**: Caches video thumbnails
- **Debounced Navigation**: Debounces rapid playlist navigation

### Accessibility
- ARIA labels for screen readers
- Keyboard navigation (Arrow keys, Enter, Space)
- Focus management
- High contrast support

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Graceful degradation for older browsers

## Use Cases

1. **Event Recordings**: Display multiple session recordings from an event
2. **Product Demos**: Showcase multiple product demonstration videos
3. **Training Content**: Organize training videos in a playlist
4. **Webinar Series**: Present a series of related webinar videos
5. **Tutorial Playlists**: Group tutorial videos by topic

## Integration Points

- Works with **YouTube Chat Block** for live video chat
- Integrates with **Event Schema** for structured data
- Uses **Milo Carousel** for horizontal scrolling (optional)
- Compatible with **Event Config** for localization

## Demo Scenarios

### Scenario 1: Basic Playlist
- 5 videos in a vertical playlist
- Click to play functionality
- Thumbnails and titles visible

### Scenario 2: Autoplay with Auto-advance
- First video autoplays
- Automatically advances to next video
- Horizontal playlist layout

### Scenario 3: Mobile Experience
- Touch-optimized playlist
- Swipeable video cards
- Responsive player sizing

### Scenario 4: Event Recordings
- Multiple session recordings
- Organized by time/date
- Search/filter capabilities (if implemented)

## Future Enhancements (Potential)

- Search/filter functionality
- Playlist sharing
- Playback speed control
- Subtitle/caption support
- Playlist progress tracking
- Analytics integration
- Custom video providers (Vimeo, etc.)

