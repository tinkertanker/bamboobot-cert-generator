# TODOs

## Admin Panel & Monetization Roadmap

### Phase 1: User Tiers & Feature Gating (Priority: CRITICAL)

#### 1.1 User Tier System
- [ ] Database schema for user tiers (free, plus, admin, super_admin)
- [ ] User limits tracking (daily_pdf_count, daily_email_count, project_count)
- [ ] Daily reset mechanism for usage counters
- [ ] Domain-based auto-upgrade (tinkertanker.com → admin)
- [ ] Super admin detection (yjsoon@tinkertanker.com from .env)

#### 1.2 Feature Gates Implementation
- [ ] PDF Generation: 10/day for free, unlimited for plus/admin
- [ ] Email Sending: 0 for free, 100/day for plus, unlimited for admin
- [ ] Project Storage: 1 for free, 10 for plus, unlimited for admin
- [ ] Client-side limit checking with upgrade prompts
- [ ] Server-side enforcement in API routes

#### 1.3 Usage Tracking
- [ ] Activity log table (user_id, action, timestamp, metadata)
- [ ] Track: PDF generations, emails sent, projects created/deleted
- [ ] Real-time usage dashboard component
- [ ] Cost projection based on usage patterns

### Phase 2: Admin Dashboard (Priority: HIGH)

#### 2.1 Core Admin Pages
- [ ] `/admin` - Overview dashboard with key metrics
- [ ] `/admin/users` - User list with tier, usage, last active
- [ ] `/admin/projects` - All projects with owner, size, age
- [ ] `/admin/usage` - Detailed usage analytics and trends
- [ ] `/admin/system` - Storage usage, queue status, health checks

#### 2.2 User Management
- [ ] Search/filter users by email, tier, usage
- [ ] Upgrade/downgrade user tiers
- [ ] View individual user's projects and usage history
- [ ] Bulk actions: upgrade multiple users, cleanup old accounts
- [ ] Export user data for analysis

#### 2.3 Project Management
- [ ] List all projects with metadata (owner, size, last modified)
- [ ] Bulk delete old projects (with age filter)
- [ ] Storage usage breakdown by user
- [ ] Orphaned project detection and cleanup
- [ ] Transfer project ownership

### Phase 3: Monitoring & Analytics (Priority: MEDIUM)

#### 3.1 Usage Analytics
- [ ] Daily/weekly/monthly usage reports
- [ ] Top users by PDF generation, email, storage
- [ ] Growth metrics: new users, upgrades, churn
- [ ] Cost analysis: estimated monthly costs by feature
- [ ] Conversion funnel: free → plus upgrade rate

#### 3.2 System Health
- [ ] Storage usage alerts (approaching limits)
- [ ] Email provider status and quota monitoring
- [ ] Error rate tracking by feature
- [ ] Performance metrics (API response times)
- [ ] Automated health check notifications

### Phase 4: Advanced Features (Priority: LOW)

#### 4.1 Automation
- [ ] Automated project cleanup (age-based with warnings)
- [ ] Usage-based tier suggestions
- [ ] Inactive user notifications
- [ ] Storage optimization recommendations

#### 4.2 Support Tools
- [ ] In-app admin notes on users/projects
- [ ] User impersonation (with audit log)
- [ ] Debug mode for specific users
- [ ] Export diagnostic bundle for troubleshooting

#### 4.3 Feature Flags
- [ ] Toggle experimental features per tier
- [ ] A/B testing framework
- [ ] Gradual rollout controls
- [ ] Emergency kill switches

## Actual things I wanted to do. Maximum priority!

- [ ] We should have some kind of email download links; see below.
- [ ] Settings page - Add user settings accessible from avatar dropdown menu
  - [ ] Preference for default PDF generation method (client/server)
  - [ ] Default email configuration
  - [ ] UI preferences (theme, layout)
  - [ ] Account management options

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
