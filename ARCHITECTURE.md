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
| `core/sync/` | ULID change log, causal merge, conflict artifacts and remote assets |
| `core/protocol.js` | Versioned extension messages |
| `sync/` | ETag coordination, pending change queue, folder identity, retries and browser event adapters |
| `background.js`, `theme-observer.*` | Service-worker composition and theme observation |
| `_locales/` | Browser metadata translations |
| `tools/` | Packaging and translation generation |

UI components share theme, geometry and motion tokens. Business services do not manipulate the page DOM. Browser messages use a common versioned protocol. Configuration and cloud formats are separate from the display version in `manifest.json`.

Status transitions reserve their layout space. Navigation gestures are registered before asynchronous icon or cloud work. Synchronization stores site, icon, order and settings entities as ULID-addressed change records with `prev_hash`, `device_id` and `created_at`. Causal branches from the same baseline merge disjoint payload fields; overlapping values become conflict copies under `_sync-conflicts/` and pause for the user.

Remote reads begin with `PROPFIND` and a strong ETag. Changed logs are fetched once and writes use `If-Match`; `412` starts a fresh read rather than overwriting. Every WebDAV request has a 10 second timeout and bounded exponential retries. An empty or incomplete `PROPFIND` response is an error, never a deletion inventory. Delete records carry `deleted_at` tombstones retained for at least 90 days, and a delete batch above `max(50, ceil(total × 5%))` requires explicit confirmation.

New-tab and options sync controls subscribe only to extension storage and protocol events. They do not import the sync engine.

Reusable UI behavior and empty-state shortcut guidance are specified in [UI_SPEC.md](UI_SPEC.md).
