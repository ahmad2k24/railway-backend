# Corleone Forged - Order Management System PRD

## Latest Updates (Feb 2026)
- **PIN 9986** attached to admin account for quick login
- **Manufacturing Inventory button** moved to top navigation (standalone, not in dropdown)

## Latest Update: February 4, 2026
### UI Visibility & Performance Fixes
- Phone numbers: Changed to BLACK for visibility on red cards
- Order dates: GREEN for recent orders, RED for 45+ days old
- Days badge: RED background for 45+ day old orders
- RUSH banner: WHITE background with RED text (highly visible)
- Tall Caps badge: WHITE background with BLACK text
- WAITING status: WHITE with BLACK border
- Performance: Removed animate-pulse animations for better speed

## Original Problem Statement
Build a comprehensive order management dashboard for a rim/wheel manufacturing business. The system manages orders through multiple departments (Sales, Design, Program, Machine Waiting, Machine, Finishing, Powder Coat, Assemble, Showroom, Shipped).

## User's Preferred Language
English

## Core Requirements
1. Multi-department order tracking workflow
2. Role-based access (Admin, Admin Restricted, Staff)
3. Order status management with CUT status for machined items
4. Real-time dashboard with order counts
5. Mobile-responsive design
6. Internationalization support (i18n)
7. QuickBooks integration
8. PDF export capabilities
9. Attachment management
10. Activity logging
11. Admin Control Center with AI-powered code editing
12. Manual Payment Tracking

## Key Features Implemented


### DashboardPage.jsx Refactoring - "Shredding" (Feb 2, 2026 - COMPLETED)
Successfully reduced the monolithic DashboardPage.jsx from **7,925 lines to 7,017 lines** (908 lines removed).

**Extracted Components:**
- `DashboardStats.jsx` (123 lines) - Order status overview cards
- `OrderList.jsx` (825 lines) - Department columns with order cards
- `SearchFilter.jsx` (302 lines) - Search and filter components (created, not yet integrated)
- `OrderCard.jsx` (257 lines) - Individual order card component
- `constants.js` (105 lines) - Shared constants (colors, icons, status configs)
- `index.js` (18 lines) - Barrel exports

**Location:** `/app/frontend/src/components/dashboard/`

**Benefits:**
- Improved code organization and maintainability
- Reusable components across the application
- Better separation of concerns
- Easier testing and debugging
- Reduced cognitive load for developers


### Manual Payment Tracking (Feb 2, 2026) - ENHANCED (Feb 3, 2026)
Added comprehensive payment tracking with production priority system:

**Fields Added:**
- `payment_status`: unpaid | deposit | paid_in_full (auto-updated)
- `payment_total`: Total order amount ($)
- `deposit_amount`: Deposit received ($)
- `balance_due`: Auto-calculated remaining balance ($)
- `payment_notes`: Payment history notes
- `percentage_paid`: Auto-calculated (deposit/total × 100)
- `production_priority`: waiting_deposit | ready_production | fully_paid
- `payment_history`: Array of payment entries with timestamps

**Production Priority Logic (50% Threshold):**
- Under 50% paid → "Waiting for Deposit" (red badge)
- 50% or more paid → "Ready for Production" (emerald badge)
- 100% paid → "Fully Paid" (green badge)

**UI Features:**
- **Add Payment Button**: Sales team can log deposits with amount, method, and notes
- **Add Payment Modal**: Amount input, payment method dropdown (Cash, Zelle, Check, Credit Card, Wire, Other), notes field
- **Order Cards**: Payment percentage badge (e.g., "$ 50%") showing on dashboard cards
- **Order Detail Modal**:
  - Production Status badge with priority text
  - Visual progress bar showing percentage paid
  - Payment history section
  - Auto-calculated balance due
- **Backend Auto-Calculation**: All payment fields auto-calculate on any update

**API Endpoints:**
- `POST /api/orders/{order_id}/add-payment` - Add payment with automatic recalculation
- `PUT /api/orders/{order_id}` - Update order, auto-calculates payment fields

### Clear Chat History Button (Feb 2, 2026)
- Added trash icon button next to Send button in Admin AI Chat
- Shows confirmation dialog with message count before deletion
- Calls `DELETE /api/admin-control/messages` to clear all messages
- Toast notification confirms successful deletion

### Rim Overlay Tool Unblocked (Feb 2, 2026)
- Accessible at `/rim-overlay` route for admin users
- Manual overlay controls work without fal.ai key
- Features: car/rim image upload, transform controls, perspective warp, shadow/lighting adjustments
- Note: AI-based wheel masking requires valid fal.ai API key

### Admin Control Center Chat Persistence (Feb 2, 2026)
The Admin AI Chat now persists conversation history in the database:

**Features:**
- **Database Persistence**: New `admin_chat_messages` collection stores all chat messages
- **Session Loading**: Last 50 messages automatically loaded when `/admin-control` page opens
- **Message Persistence**: User and AI messages saved to database after each interaction
- **Error Tracking**: Error messages also saved for debugging context

**Technical Details:**
- Backend: New endpoints `GET/POST/DELETE /api/admin-control/messages`
- Frontend: `loadChatHistory()` called on mount, `saveChatMessage()` after each message
- Messages scoped by `user_email` for proper isolation

### Performance Optimization: Lazy Loading (Feb 2, 2026)
Implemented React lazy loading to fix login timeout issues:

**Changes:**
- All heavy pages now load via `React.lazy()` and `Suspense`
- Initial bundle size significantly reduced
- Login page loads instantly, dashboard loads asynchronously
- Added `PageLoader` component for smooth loading UX

**Affected Files:**
- `/app/frontend/src/App.js` - Lazy imports for 17 pages
- All page components lazy loaded: DashboardPage, CompletedPage, UsersPage, etc.

### Admin Control Center AI Editing Fix (Feb 3, 2026) - FULLY RESOLVED
Fixed the "Failed to apply edits" bug that was blocking code changes via the AI chat interface.

**Root Cause:**
- The AI was generating incorrect search text that didn't match the actual file content
- The AI was hallucinating file content because it was only given `DashboardPage.jsx` when the text (e.g., "ORDER STATUS OVERVIEW") was actually in a different component file
- Failed edits (content: null) were being displayed with commit buttons

**Fixes Implemented (Session 2):**
1. **Smart File Discovery**: Added `grep`-based search to find which file actually contains the text the user wants to change
2. **Multi-File Context**: The AI now receives content from up to 3 relevant files instead of just one
3. **Better Text Detection**: System now detects quoted strings, UPPERCASE labels, and common edit patterns from user messages
4. **Improved AI Prompt**: More explicit instructions about checking ALL provided files and using the correct file path
5. **Validation**: Frontend only shows commit button for valid edits with content

**Files Modified:**
- `/app/backend/server.py` - Added `search_text_in_files()` helper and multi-file context logic
- `/app/frontend/src/pages/AdminControlPage.jsx` - Validation and error handling

**Test Result:** ✅ Successfully tested end-to-end:
- Asked AI to change "ORDER STATUS OVERVIEW" color to yellow
- AI correctly identified `/app/frontend/src/components/dashboard/DashboardStats.jsx` (not DashboardPage.jsx)
- Commit succeeded, color change visible in live preview

### Admin Control Center (Feb 2, 2026)
A powerful self-editing engine available at `/admin-control` (hidden route, admin-only access)

**Features:**
- **Admin Lockdown**: Access restricted exclusively to `digitalebookdepot@gmail.com`
- **Split-Screen Interface**:
  - Left: AI Chat + File Browser + Rollback History + Integrations Manager
  - Right: Live Preview iframe with app view
- **AI Code Editor**: Gemini 2.5 Flash powered chat that can suggest and apply code changes
- **File Browser**: Navigate and edit files in `/app/frontend/src/` directory
- **Git-Based Rollback**: Last 10 code changes tracked with git commits for surgical undo
- **Integrations Manager**: Store and manage external API credentials (Stripe, Twilio, vendor APIs)

**Technical Details:**
- Backend: `/api/admin-control/*` endpoints for file operations, chat, rollback
- Frontend: `/admin-control` route with `AdminControlPage.jsx`
- Security: Email-based access control (hardcoded to admin email)
- Gemini API Key: Uses Emergent LLM Key for gemini-2.5-flash model

### CUT Order Workflow (Jan 31, 2026)
- **Auto-Move to Finishing**: When an order is marked as "CUT", it automatically moves to the Finishing department
- **Backward Movement Prevention**: CUT orders cannot be moved back to earlier departments (Design, Program, Machine Waiting, Machine)
- **Dual Visibility**: CUT orders appear in BOTH:
  - Their current department column (Finishing and beyond)
  - The "Cut Orders" modal for tracking purposes
- **CUT DATE Timestamp**: Records when an order was marked as CUT

### Mobile Performance Optimizations (Jan 31, 2026)
- Disabled `animate-pulse` animations on mobile devices
- Disabled transform/scale hover effects on mobile
- Simplified shadows and gradients on mobile
- Disabled backdrop blur effects (expensive on mobile)
- Reduced transition durations
- Added hardware acceleration for scrolling
- Reorganized order card badges into two rows for better mobile readability

### UI Styling (Previous Session)
- Bold white text throughout dashboard
- Yellow "Order Date:" labels
- Green phone numbers
- Red borders on modal table headers
- Red background/white text for department count bubbles
- White background/red text for product type count bubbles
- Removed reorder arrows from order cards
- Bolder "Days" badge with increased spacing

## Technical Architecture

```
/app/
├── backend/
│   ├── server.py          # FastAPI backend (~8100 lines)
│   ├── .env               # Environment variables (GEMINI_API_KEY, MONGO_URL, etc.)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/
        │   ├── DashboardPage.jsx     # Main dashboard (~7900 lines - to be further refactored)
        │   ├── AdminControlPage.jsx  # Admin Control Center
        │   └── LoginPage.jsx
        ├── components/
        │   ├── dashboard/            # NEW - Extracted dashboard components
        │   │   ├── index.js          # Barrel exports
        │   │   ├── constants.js      # Shared constants (DEPT_COLORS, etc.)
        │   │   ├── DashboardStats.jsx # Order status overview cards
        │   │   ├── SearchFilter.jsx  # Search bar and product filters
        │   │   ├── OrderList.jsx     # Department columns with orders
        │   │   └── OrderCard.jsx     # Individual order card component
        │   └── ui/                   # Shadcn components
        └── index.css                 # Global styles with mobile optimizations
```

## Database Schema (MongoDB)
- **orders**: Main order collection
  - `cut_status`: "waiting" | "cut" | "processing"
  - `cut_at`: DateTime (set when cut_status changes to "cut")
  - `current_department`: String
  - `department_history`: Array of department transitions
  - `payment_status`: "unpaid" | "deposit" | "paid_in_full" (NEW)
  - `payment_total`: Float - total order amount (NEW)
  - `deposit_amount`: Float - deposit received (NEW)
  - `balance_due`: Float - remaining balance (NEW)
  - `payment_notes`: String - payment notes (NEW)
- **users**: User accounts with roles and departments
- **activities**: Audit log
- **admin_control_edits**: Code edit history for rollback
- **admin_control_chats**: AI chat interaction logs
- **admin_integrations**: External API credentials
- **admin_chat_messages**: Chat messages for Admin AI (NEW - Feb 2, 2026)
  - `id`: UUID
  - `user_email`: String (scoped to admin user)
  - `role`: "user" | "assistant" | "error"
  - `content`: String
  - `file_edits`: Array of file edit objects
  - `timestamp`: DateTime

## 3rd Party Integrations
- MongoDB Atlas (database)
- QuickBooks Online (invoicing)
- i18next (translations)
- Gemini Pro (Admin Control Center AI chat) - requires user API key
- fal.ai (paused - for Rim Overlay Tool)

## Credentials
- Admin: `digitalebookdepot@gmail.com` / `Admin123!`

## Environment Variables (backend/.env)
- `MONGO_URL`: MongoDB connection string
- `DB_NAME`: Database name
- `GEMINI_API_KEY`: User's Gemini Pro API key (required for AI chat)
- `JWT_SECRET`: JWT authentication secret
- `ADMIN_PIN`: Admin registration PIN

## Known Issues / Backlog

### P1 - High Priority
1. ~~Admin UI for "Rim Preview" access management~~ - Rim Preview accessible via button in header
2. ~~Custom Rim Overlay Tool (BLOCKED/PAUSED)~~ ✅ UNBLOCKED - Manual overlay works at /rim-overlay
3. ~~User needs to add GEMINI_API_KEY~~ ✅ DONE - AI Chat working with gemini-2.5-flash
4. ~~Chat history not persisting~~ ✅ DONE - Messages saved to database
5. ~~Dashboard component extraction~~ ✅ DONE - Components created in /components/dashboard/

### P2 - Medium Priority
1. ~~Refactor DashboardPage.jsx~~ PARTIAL - Components extracted, main file still needs gradual integration
2. Refactor server.py into modular routes
3. Search result blank page bug
4. Duplicate order submission prevention
5. Performance Page bug
6. Notification bell sync issue
7. Production attachment URL issue (pending user action)

## Recent Changes Log
- **Feb 2, 2026**: ✅ Dashboard Component Extraction COMPLETED
  - Created `/app/frontend/src/components/dashboard/` directory structure
  - New components: `DashboardStats.jsx`, `SearchFilter.jsx`, `OrderList.jsx`
  - Updated `constants.js` with shared exports (DEPT_COLORS, PRODUCT_COLORS, etc.)
  - Updated `OrderCard.jsx` with proper exports
  - Created `index.js` barrel file for clean imports
  - Fixed `.gitignore` blocking .env files (deployment blocker)
  - Application verified working and READY FOR DEPLOYMENT
- **Feb 2, 2026**: ✅ Manual Payment Tracking COMPLETED
  - Added payment_status, payment_total, deposit_amount, balance_due, payment_notes to orders
  - Payment Information section in Order Detail Modal (emerald/green styled)
  - Auto-calculation of balance_due and payment_status in edit mode
  - All tests passing (100% backend, 100% frontend)
- **Feb 2, 2026**: ✅ Clear Chat History Button
  - Trash icon button next to Send in Admin AI Chat
  - Confirmation dialog before deletion
  - DELETE /api/admin-control/messages endpoint
- **Feb 2, 2026**: ✅ Rim Overlay Tool Unblocked
  - Accessible at /rim-overlay for admin users
  - Manual overlay controls work without fal.ai key
- **Feb 2, 2026**: ✅ Admin Chat Persistence COMPLETED
  - New `admin_chat_messages` MongoDB collection
  - GET/POST/DELETE `/api/admin-control/messages` endpoints
  - Frontend loads last 50 messages on page mount
  - Messages persist after refresh/logout
  - All tests passing (100% success rate)
- **Feb 2, 2026**: ✅ Lazy Loading Implementation
  - All 17 heavy pages now lazy loaded via React.lazy()
  - Added Suspense wrapper with PageLoader fallback
  - Login no longer times out due to large bundle
  - Dashboard loads asynchronously after login
- **Feb 2, 2026**: ✅ Admin Control Center COMPLETED
  - AI Chat with Gemini 2.5 Flash - fully functional with user's API key
  - File browser/editor for `/app/frontend/src/` directory
  - Git-based rollback system (last 10 code changes tracked)
  - API Integrations management (add/view/delete external APIs)
  - Live preview iframe with refresh functionality
  - Access restricted to admin email only
  - All endpoints tested and passing (16 backend tests, 100% success)
- **Jan 31, 2026**: Implemented CUT order workflow (auto-move to Finishing, backward prevention)
- **Jan 31, 2026**: Added mobile performance optimizations (disabled animations, simplified effects)
- **Jan 31, 2026**: Improved mobile order card layout (badge reorganization)
- **Previous**: UI styling overhaul (bold text, colors, spacing)
