# UI specification

## Shared foundations

- Geometry comes from `ui/geometry.css`. Reusable surfaces use the shared G2 continuous-corner tokens; circular and capsule controls keep their native round geometry.
- Theme colors come from `ui/themes/`. Text, glyphs, borders and controls must remain readable in both light and dark themes.
- Motion duration and easing come from `ui/tokens.css`. Reusable components define their own entry and exit; reduced-motion preferences are respected.
- State changes keep surrounding layout stable. Loading, results and errors stay within reserved feedback regions.
- Scrollable surfaces share the scrollbar component. Notifications do not scroll.

## Empty-state shortcut guidance

Component: `ui/components/empty-state-hint.js` and `ui/components/empty-state-hint.css`.

Place the guidance directly beneath the bookmark instructions, with a 20px gap. Use two concise rows, each combining a platform keycap, a plus sign, a simple mouse glyph and a localized action label. Row spacing is 12px and inline spacing is 8px.

- macOS: show the ⌥ glyph with an accessible Option label.
- Windows and Linux: show an Alt keycap.
- First row: modifier + click empty space opens extension settings.
- Second row: modifier + click a website icon edits that icon’s appearance.
- Show only when the managed bookmarks folder has no websites. Hide when websites exist; do not append guidance to errors or image-loading states.
- Keycaps use shared continuous corners and theme surfaces. The mouse glyph uses the same foreground color, rounded stroke ends and no shadow.
- Keep the normal cursor. The hint is informational; the existing blank-canvas gesture remains the settings entry point.
- Localize labels and allow wrapping on narrow windows without horizontal overflow. Preserve native status announcements; decorative glyphs are hidden from assistive technology.
