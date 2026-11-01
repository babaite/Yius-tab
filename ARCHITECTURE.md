# Architecture

| Directory / entry | Responsibility |
|---|---|
| `newtab/js/app.js` | New-tab page composition and interactions |
| `newtab/js/` | Grid layout, icon presentation, source menus, color picker and notifications |
| `options/` | Extension settings and backup controls |
| `ui/tokens.css`, `ui/geometry.css` | Shared dimensions, timing, curves and continuous corners |
| `ui/themes/`, `ui/components/`, `ui/pages/` | Themes, reusable controls and page layouts |
| `core/icons/` | Website, third-party and App Store icon acquisition and image handling |
| `core/bookmarks/` | Bookmark snapshots and application of changes |
| `core/config/` | Settings validation and portable configuration backups |
| `core/storage/` | Local icon records and image assets |
| `core/net/` | WebDAV transport and configuration |
| `core/sync/` | Merge planning, remote assets and maintenance |
| `core/protocol.js` | Versioned extension messages |
| `sync/` | Sync coordination, state model, folder identity and browser event adapters |
| `background.js`, `theme-observer.*` | Service-worker composition and theme observation |
| `_locales/` | Browser metadata translations |
| `tools/` | Packaging and translation generation |

UI components share theme, geometry and motion tokens. Business services do not manipulate the page DOM. Browser messages use a common versioned protocol. Configuration and cloud formats are separate from the display version in `manifest.json`.

Status transitions reserve their layout space. Navigation gestures are registered before asynchronous icon or cloud work. Synchronization keeps local edits and immutable image assets separate from remote transport.

Reusable UI behavior and empty-state shortcut guidance are specified in [UI_SPEC.md](UI_SPEC.md).
