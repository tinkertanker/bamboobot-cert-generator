# TODOs

## Admin Panel Roadmap

Goals
- Give admins clear visibility into usage, health, and content.
- Provide safe management tools with audit trails and least‑privilege.

MVP Scope (Phase 1)
- Overview: tiles for users, projects, active 7d, emails sent 24h, rate‑limit hits.
- Users: searchable list, last active, project count; view‑only.
- Projects: recent projects with owner, size, last modified; soft delete/restore.
- Activity: last 100 actions (sign‑ins, imports, generates) with timestamps.
- System: storage usage (local/R2), queue/backlog estimates, env sanity checks.

Phase 2
- User management: deactivate/reactivate, force passwordless invite, impersonate (secure, audited).
- Project tools: transfer ownership, export JSON, verify image assets, bulk delete.
- Emails: delivery log (status, provider response), re‑send failed, rate dashboards.
- Rate limiting: per‑route charts, banlist allowlist controls, IP/user views.
- Feature flags: toggles for experimental features (client PDFs, progressive gen).
- Support: in‑app admin notes on users/projects; canned diagnostics export.

Data Model Additions (Prisma)
- AuditLog { id, actorId, action, targetType, targetId, metadata Json, createdAt }
- EmailLog { id, userId, projectId?, status, provider, response Json, createdAt }
- Flag { key unique, value Json, updatedAt }

APIs
- GET/POST `/api/admin/audit`, `/api/admin/users`, `/api/admin/projects`, `/api/admin/rate`, `/api/admin/emails`, `/api/admin/flags`.
- All endpoints require admin check via `ADMIN_EMAILS` and JWT.

Access Control & Security
- Gate UI and APIs behind admin middleware; server‑verify on every request.
- No destructive actions without confirmation; require reason text for deletes/transfers.
- Full audit log for all admin actions; include actor, IP, user‑agent.

Observability
- Surface error rates (5xx), slow endpoints (p95), queue lengths if applicable.
- Add lightweight server counters; later wire to external monitoring.

Testing
- Playwright admin flows (auth, navigation, soft delete/restore).
- Unit tests for audit logging and permission checks.

Rollout Plan
- P1: Overview + Users/Projects read‑only + AuditLog write.
- P2: Safe writes (soft delete/restore, transfers) + Email/Rate views.
- P3: Feature flags, impersonation (guarded), exports.

**Env Flags To Tweak**
- **Auth:** `NEXT_PUBLIC_REQUIRE_AUTH`
- **Admin:** `ADMIN_EMAILS`
- **Limits:** `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_*_PER_MIN`
- **Storage/Email:** existing R2/S3/Resend/SES variables

**Open Items (Next)**
- **Rate limits (prod):** Move to Redis for multi‑instance deployments.
- **UI logging:** Convert remaining `console.log` in hooks/components to `lib/log` if we want quieter consoles.
- **Types polish:** Reduce lingering `any` in APIs and hooks (lint‑only).
- **E2E:** Add Playwright auth‑redirect + first‑login import coverage with auth gating enabled.


## Actual things I wanted to do. Maximum priority!

- [ ] We should have some kind of email download links; see below.

## Future Enhancement: Email Download Links for Client-Side PDFs

Currently, when using client-side PDF generation:

- ✅ **Email attachments work** - PDFs are sent directly as attachments
- ❌ **Download links don't work** - Would require uploading PDFs to cloud storage first

To implement download links for client-side PDFs:

1. When "Download Link" is selected with client-side PDFs
2. Upload each PDF to cloud storage (R2/S3) via a new API endpoint
3. Get back the public URL
4. Send that URL in the email

This would add complexity and negate some benefits of client-side generation (like reduced server load), so it's deferred until there's a clear need.

UI-wise, we would let the user decide this at the summary modal they get when they click generate.

## Some stuff Claude came up with

### 1. Data Validation (High Priority)

- [ ] Visual indicators for empty required fields
- [ ] Email format validation
- [ ] Duplicate detection

### 2. Better Error Messages (Medium Priority)

- [ ] Replace technical errors with user-friendly messages
- [ ] Add "Try again" buttons
- [ ] Suggest fixes for common issues

### 4. Performance Optimizations (High Impact)

#### 4.1 React.memo Optimization for CertificatePreview

- [ ] Replace expensive `JSON.stringify()` comparison with selective shallow + deep checks
- [ ] Only compare current table row data, not entire array
- [ ] Compare only position properties that affect rendering
- **Expected Impact**: 85-90% reduction in comparison time during drag operations

#### 4.2 Smart Debouncing for Drag Operations

- [ ] Create `useDragDebounce` hook with immediate visual feedback + settled state
- [ ] Use 16ms throttle for visual updates (60fps smooth dragging)
- [ ] Use 50ms debounce for final position updates
- **Expected Impact**: 40-50% fewer React renders during drag

#### 4.3 Lazy Font Loading

- [ ] Create `FontManager` singleton for dynamic font loading
- [ ] Load only Rubik + system fonts initially
- [ ] Load Google Fonts (Montserrat, Poppins, etc.) only when selected
- [ ] Add font preloading for commonly used fonts
- **Expected Impact**: 70% smaller initial bundle (~350KB saved), 200-400ms faster load

#### 4.4 Text Measurement Cache

- [ ] Implement singleton canvas context for text measurements
- [ ] Add LRU cache for text width calculations (max 1000 entries)
- [ ] Cache key: `text|fontSize|fontFamily|bold|italic`
- **Expected Impact**: 60-80% faster text calculations

### 5. Quick Wins (< 1 day each)

- [ ] Entry jump navigation (go to specific row)
- [ ] Loading states for async operations
- [ ] Tooltip improvements
- [ ] Add performance monitoring utility for measuring improvements
