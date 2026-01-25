# Planning Guide

A web application that empowers users to create stunning photo collages by selecting photos and choosing from dynamic grid layouts, then customizing and downloading their creations.

**Experience Qualities**: 
1. **Creative** - Users should feel empowered to experiment with different layouts and arrangements, discovering new ways to showcase their photos
2. **Effortless** - The interface should make complex layout decisions simple, with intuitive drag-and-drop and instant previews
3. **Professional** - The final output should look polished and high-quality, suitable for sharing or printing

**Complexity Level**: Light Application (multiple features with basic state)
This app handles photo uploads, layout selection, customization controls, and image export - all with persistent state but without complex multi-view navigation or backend integration.

## Essential Features

**Photo Upload & Management**
- Functionality: Users can upload 1-9 photos via file picker or drag-and-drop
- Purpose: Provides the source material for creating collages
- Trigger: User clicks upload area or drags files onto the designated zone
- Progression: Select upload area → Choose/drag files → Photos appear as thumbnails → Ready for layout selection
- Success criteria: All uploaded photos display correctly, maintain quality, and are stored in app state

**Dynamic Layout Gallery**
- Functionality: Displays 5-10 different layout options based on the number of photos uploaded
- Purpose: Gives users creative choices for arranging their photos
- Trigger: Automatically updates when photo count changes
- Progression: Upload photos → Layout options appear → Scroll through options → See live previews with actual photos
- Success criteria: Layouts update instantly, show real photo previews, and offer diverse arrangements for each photo count

**Layout Preview & Selection**
- Functionality: Shows a large, detailed preview of the selected layout with user's photos
- Purpose: Allows users to see exactly what their collage will look like
- Trigger: User clicks on a layout option
- Progression: Click layout → Preview updates → Photos populate layout → User sees final arrangement
- Success criteria: Preview is large and clear, updates instantly, accurately represents final output

**Photo Reordering**
- Functionality: Users can swap which photo appears in which position within the layout
- Purpose: Gives users control over the visual flow and composition
- Trigger: User drags a photo to a different position or clicks swap controls
- Progression: Click/drag photo in preview → Drag to new position → Photos swap places → Preview updates
- Success criteria: Reordering is smooth and intuitive, preview updates immediately

**Customization Controls**
- Functionality: Adjust spacing between photos, add background colors, control borders
- Purpose: Personalize the collage aesthetic to match user preferences
- Trigger: User adjusts sliders or color pickers
- Progression: Open controls → Adjust spacing slider → Select background color → See live preview update
- Success criteria: Changes apply instantly to preview, controls are easy to understand and use

**High-Quality Export**
- Functionality: Download the finished collage as PNG or JPEG
- Purpose: Allows users to save and share their creation
- Trigger: User clicks download button
- Progression: Finalize design → Click download → Select format → File downloads to device
- Success criteria: Downloaded image maintains high quality, matches preview exactly, filename is descriptive

## Edge Case Handling

- **No Photos Uploaded**: Display welcoming empty state with upload instructions and example layouts
- **File Type Errors**: Show clear error message if unsupported format is uploaded, list accepted formats
- **Large File Sizes**: Optimize images on upload to maintain quality while ensuring performance
- **Browser Compatibility**: Provide fallback if HTML5 canvas or File API not supported
- **Mobile Touch**: Ensure drag-and-drop works with touch gestures on mobile devices
- **Download Failures**: Retry mechanism and error notification if download fails

## Design Direction

The design should evoke creativity, possibility, and delight - like opening a professional design tool but without the complexity. It should feel modern and artistic, with a gallery-like quality that puts the user's photos front and center. The interface should fade into the background, letting the photos and layouts shine while still feeling premium and well-crafted.

## Color Selection

A vibrant, creative palette that feels artistic and modern without overwhelming the photos.

- **Primary Color**: Deep plum `oklch(0.45 0.15 310)` - Rich and creative, communicates artistic sophistication
- **Secondary Colors**: 
  - Soft lavender `oklch(0.85 0.08 310)` for subtle backgrounds and inactive states
  - Warm coral `oklch(0.70 0.15 25)` for accents and highlights
- **Accent Color**: Electric violet `oklch(0.60 0.20 300)` for CTAs, active states, and drawing attention to key actions
- **Foreground/Background Pairings**: 
  - Background (Soft cream `oklch(0.98 0.01 85)`): Deep plum text `oklch(0.45 0.15 310)` - Ratio 8.2:1 ✓
  - Primary (Deep plum `oklch(0.45 0.15 310)`): White text `oklch(1 0 0)` - Ratio 9.1:1 ✓
  - Accent (Electric violet `oklch(0.60 0.20 300)`): White text `oklch(1 0 0)` - Ratio 5.8:1 ✓
  - Secondary (Soft lavender `oklch(0.85 0.08 310)`): Deep plum text `oklch(0.45 0.15 310)` - Ratio 4.9:1 ✓

## Font Selection

Typography should feel modern and editorial, with personality that matches the creative nature of the app while maintaining excellent readability for UI elements.

- **Typographic Hierarchy**: 
  - H1 (App Title): Plus Jakarta Sans Bold / 32px / -0.02em letter spacing
  - H2 (Section Headers): Plus Jakarta Sans Semibold / 20px / -0.01em letter spacing
  - Body (UI Text): Plus Jakarta Sans Regular / 15px / normal letter spacing
  - Small (Labels): Plus Jakarta Sans Medium / 13px / 0.01em letter spacing
  - Button Text: Plus Jakarta Sans Semibold / 14px / normal letter spacing

## Animations

Animations should create moments of delight during interaction while maintaining clarity and purpose. Use subtle springs for layout transitions, smooth fades when changing previews, and satisfying micro-interactions on buttons. Photo uploads should have a gentle fade-in, layout switches should morph smoothly, and the download action should feel rewarding with a subtle success animation.

## Component Selection

- **Components**: 
  - Card for layout option thumbnails and the main preview area
  - Button for upload trigger, download, and layout selection
  - Slider for spacing/gap controls
  - Tabs for switching between customization panels
  - Popover for color picker
  - ScrollArea for layout gallery
  - Badge for photo count indicators
  - Progress for upload feedback
  - Dialog for export options
- **Customizations**: 
  - Custom drag-and-drop upload zone with animated border on hover/drag
  - Custom photo grid renderer using CSS Grid with dynamic template areas
  - Custom photo position component with drag handles
  - Custom layout thumbnail component showing miniature grid structure
- **States**: 
  - Buttons: Default has subtle shadow, hover lifts with increased shadow, active scales down slightly, disabled is muted with no shadow
  - Upload zone: Default has dashed border, hover/drag-over shows solid border with accent color glow
  - Layout options: Default has border, hover shows elevated shadow, selected has accent border and subtle background
  - Photo slots: Default shows placeholder, hover shows swap icon, dragging shows ghost image
- **Icon Selection**: 
  - UploadSimple for upload action
  - DownloadSimple for export
  - GridFour for layout options
  - Palette for color customization
  - ArrowsOutSimple for spacing controls
  - Shuffle for randomize/reorder
  - Image for photo placeholders
  - X for removing photos
- **Spacing**: 
  - Container padding: `p-6` on mobile, `p-8` on desktop
  - Section gaps: `gap-6` for major sections
  - Card padding: `p-4` for thumbnails, `p-6` for preview
  - Control groups: `gap-4` between related controls
  - Button padding: `px-6 py-3` for primary actions
- **Mobile**: 
  - Upload area takes full width with vertical layout
  - Layout gallery becomes single column with larger thumbnails
  - Preview area stacks below controls on mobile
  - Download button becomes sticky at bottom on mobile
  - Controls collapse into accordion sections for better space usage
  - Touch-friendly sizing with minimum 44px tap targets
