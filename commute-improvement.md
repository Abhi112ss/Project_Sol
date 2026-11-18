# Feature Specification: Commute-Centred Management and Calendar-Based Scheduling

Act as a senior product designer, Flutter engineer, Next.js engineer, and backend architect.

I want to redesign how recurring employee commutes, fleet operator approvals, and driver schedules are presented.

The primary objective is to make the application feel professional, organized, intuitive, and uncluttered.

**Core UX principle: Show the user one named commute, not dozens of individual daily bookings. Let them open that commute to explore its schedule and individual trip details.**

Do not treat this as merely a visual redesign. Implement the appropriate data relationships, navigation, state management, and backend integration.

Preserve the existing technology stack and architecture.

---

## 1. Understand the two levels of scheduling

The system must distinguish between two concepts.

### A. Commute Plan

A Commute Plan represents an employee's recurring travel arrangement.

For example:

- Commute name: Home → Office | Morning | Chinthal
- Direction: Home to Office
- Locality: Chinthal
- Time preference: Arrive by
- Requested time: 8:00 AM
- Booking duration: 1 month
- Selected days: Monday to Friday
- Start date: 1 December
- End date: 31 December

This is one recurring commute, not 22 or 23 unrelated bookings.

### B. Daily Trip Occurrences

Each applicable date in the Commute Plan generates its own individual ride reservation.

For example:

- 1 December — trip occurrence
- 2 December — trip occurrence
- 3 December — trip occurrence
- Continue through the applicable booking period.

Each occurrence has its own allocation, driver, vehicle, operational status, and trip history.

Do not create a single month-long operational trip.

The recurring plan is the parent. Date-specific reservations and trips are its children.

The same model must support single-day, weekly, monthly, and custom-duration bookings.

---

## 2. Fleet Operator Experience — Commute-Centred Approval Workspace

### Current problem

Fleet operators may handle hundreds of employee bookings and many recurring schedules.

Displaying every individual date-specific booking in one large list creates clutter and makes approvals difficult.

The operator should be able to focus on one commute at a time.

### Required home screen

Create a clean dispatch and approval workspace.

Group compatible booking requests by their commute identity and relevant operating attributes.

Each commute should appear as one compact card or row, rather than displaying every daily reservation separately.

Example commute cards:

**Commute A**

- Chinthal → Office
- Morning shift
- Arrive by 8:00 AM
- 5 employees
- Monthly schedule
- 22 scheduled service dates
- 2 dates need attention

**Commute B**

- Hayathnagar → Office
- Morning shift
- Arrive by 9:00 AM
- 8 employees
- Weekly schedule
- 5 scheduled service dates
- Awaiting allocation

**Commute C**

- Office → Miyapur
- Evening shift
- Pickup around 6:00 PM
- 6 employees
- Monthly schedule
- Fully allocated

The examples are illustrative.

### Commute detail page

When the operator clicks a commute card, navigate to a dedicated Commute Details page.

This page must display only the information relevant to that commute.

Do not continue showing unrelated commuters or other dispatch groups inside this page.

Include:

1. Commute name and unique identifier.
2. Journey direction.
3. Pickup and destination locality.
4. Time preference and requested time.
5. Booking duration.
6. Applicable weekdays.
7. Associated employees and their booking information.
8. Vehicle requirements.
9. Driver suggestions and locality matches.
10. Date-specific allocation status.
11. Approval and publication controls.
12. Booking modification and audit history.

The operator must be able to inspect the employees, understand their requirements, review the proposed allocation, and approve or modify it without unrelated data interrupting their focus.

Provide clear navigation back to the main commute workspace.

### Approval workflow

The operator should be able to:

- Review the complete recurring commute.
- Review its individual scheduled dates.
- Approve feasible proposed assignments.
- Identify dates with allocation conflicts.
- Manually correct exceptional assignments.
- Approve or publish the applicable trips.
- Recalculate future allocations when bookings change.

Support bulk approval for valid scheduled dates, but preserve the ability to inspect and approve individual dates.

Do not silently modify already-published trips.

---

## 3. Driver Application — Commute Cards Instead of Repeated Messages

### Current problem

Imagine a driver is assigned a recurring commute for an entire month.

The driver should not see 22 or 23 separate commute messages or individual booking cards on their home screen.

That creates unnecessary clutter and makes the actual work difficult to find.

### Required driver home screen

Display each assigned recurring commute as one named card.

Example:

**Chinthal Morning Pickup**

- Home → Office
- Morning shift
- Arrive by 8:00 AM
- 1 December – 31 December
- 22 scheduled trip dates
- Next trip: Tomorrow, 7:15 AM

Another example:

**Miyapur Evening Drop**

- Office → Home
- Evening shift
- Pickup around 6:00 PM
- 1 December – 31 December
- 20 scheduled trip dates
- Next trip: Today, 6:00 PM

These are illustrative.

The home screen should prioritize:

- Next upcoming trip.
- Current active trip, when applicable.
- Assigned recurring commute cards.
- Important operational alerts.

Do not display one card per date for a recurring commute.

Do not generate 30 redundant home-screen notifications for a month-long assignment.

Use notifications for meaningful upcoming-trip reminders, assignment changes, cancellations, and operational alerts.

---

## 4. Driver Commute Details — Interactive Calendar

When the driver taps a commute card, open its dedicated Commute Schedule page.

This page should contain:

### A. Calendar

Display a polished monthly calendar.

Each date should indicate whether the driver has an assigned trip for that particular commute.

Color semantics:

- **Blue:** A scheduled trip exists for this commute on that date.
- **Grey:** No trip is scheduled for this commute on that date.

Today should have a distinct selection outline or visual indicator without confusing it with the trip-status colors.

The calendar must accurately reflect the driver's actual published assignments, not merely the employee's original recurring booking dates.

A scheduled date that has subsequently been cancelled or reassigned must no longer appear as an active trip for that driver.

### B. Date selection

When the driver selects a blue date, display that date's trip details.

Include:

- Trip date.
- Scheduled start time.
- Journey direction.
- Vehicle information.
- Employee count.
- Passenger manifest.
- Pickup sequence.
- Individual pickup locations.
- Scheduled stop times where available.
- Office or final destination.
- Trip status.
- Navigation action when operationally appropriate.

When the driver selects a grey date, show a simple empty state:

"No trip assigned for this date."

### C. Calendar navigation

Support:

- Previous month.
- Next month.
- Current month shortcut.
- Selected-date highlighting.
- Clear indication of dates with scheduled trips.
- Appropriate treatment of dates outside the assignment period.

Do not allow a driver to execute trips belonging to another driver or access unauthorized passenger data.

### D. Active trip behavior

When a scheduled trip becomes active, show an action to open the actual trip execution interface.

The trip execution interface must reuse the existing driver workflow:

1. Start trip.
2. Navigate to the next approved stop.
3. Record pickup or no-show.
4. Receive the next stop from the backend.
5. Continue until the trip is completed.

Do not rebuild or duplicate the existing trip execution functionality.

---

## 5. Keep recurring commute identity separate from daily operational assignments

This distinction is critical.

A recurring commute represents a scheduled travel arrangement.

A daily trip occurrence represents an actual operational assignment.

One commute can generate many trip occurrences, and the driver or vehicle may change between dates.

For example:

- 1 December — Driver A, Sedan 1.
- 2 December — Driver A, Sedan 1.
- 3 December — Driver B, Sedan 2.
- 4 December — No trip because the date was skipped.

The driver calendar must show only the trips actually assigned and published to that driver.

Do not assume the same driver or vehicle must remain assigned throughout the whole recurring booking period.

The fleet operator must retain control over daily allocation changes.

The recurring commute should remain recognizable even if the operational assignment changes.

---

## 6. Backend and database requirements

Inspect the existing database before creating new tables.

Reuse existing booking, recurring schedule, trip, passenger assignment, driver, and vehicle entities wherever possible.

Establish clear parent-child relationships between:

- Commute Plan.
- Date-specific Ride Reservation.
- Daily Operational Trip.
- Passenger Assignment.
- Driver and Vehicle Assignment.

Each recurring plan needs a stable identifier.

Each date-specific occurrence needs its own unique identifier and date.

Store the connection between the parent commute and each individual reservation.

Provide APIs or adapt existing endpoints for:

- Listing commute plans for an authorized fleet operator.
- Retrieving a single commute and its details.
- Retrieving date-specific allocation statuses.
- Retrieving a driver's assigned commute cards.
- Retrieving a driver's commute calendar.
- Retrieving a selected date's actual trip details.
- Updating allocations and publishing trip changes.

Use server-side pagination and filtering for large operator workspaces.

Avoid loading every individual daily reservation into the initial home screen.

The calendar should retrieve compact schedule/status data and load full trip details only when a date is selected.

Prevent duplicate commute occurrences and preserve historical data.

---

## 7. UI and visual design requirements

This should feel like a premium enterprise transportation product.

Avoid a generic administration template.

### Shared design principles

- Clean visual hierarchy.
- Comfortable spacing.
- Consistent typography.
- Carefully designed cards.
- Clear status indicators.
- Minimal unnecessary information.
- Smooth page transitions.
- Appropriate loading and skeleton states.
- Useful empty states.
- Responsive layouts.
- Accessible touch targets and typography.

### Driver experience

The driver application must be simple, readable, and operationally focused.

The driver should be able to understand their schedule at a glance.

Make the commute cards and calendar visually clear without filling the screen with unnecessary information.

### Fleet operator experience

The operator must be able to process many commute approvals efficiently.

Use structured tables or compact cards, meaningful grouping, search, filters, and focused detail pages.

Do not show all employee data from all commutes inside one detail view.

### Navigation principle

Main commute list → Selected commute details → Calendar or date-specific trip → Back to commute list.

Preserve the user's context when navigating back, including search, filters, and scroll position where appropriate.

---

## 8. Acceptance criteria

The implementation is successful only when:

1. A month-long commute appears as one commute card, not 30 separate cards.
2. The operator can open one commute and inspect only its relevant information.
3. The operator can review and approve individual dates or valid groups of dates.
4. The driver sees one card for a recurring assigned commute.
5. Selecting the commute opens a monthly calendar.
6. Blue dates accurately represent actual published trips assigned to that driver.
7. Grey dates represent dates without an assigned trip for that commute.
8. Selecting a scheduled date displays its actual trip manifest.
9. A reassignment to another driver updates the original driver's calendar.
10. Cancelled dates are no longer shown as active assignments.
11. A booking's expiry prevents further trip occurrences from being generated.
12. Historical trips remain accessible according to permissions.
13. Multiple recurring commutes can coexist without mixing their schedules.
14. The interface remains responsive and usable with hundreds or thousands of commute plans.
15. No existing booking, dispatch, or trip execution functionality is duplicated.

## 9. How to approach implementation

First inspect the existing repository and identify what can be reused.

Then propose the required database relationships, API contracts, navigation structure, and UI changes.

Implement the feature within the existing architecture.

Do not invent new business rules when the existing project already contains an agreed rule.

Where an important business rule is missing, identify the assumption explicitly.

Deliver complete, integrated code rather than disconnected UI mockups or pseudocode.

The final experience should communicate one simple idea:

**One commute. One organized schedule. Individual trips available when needed. No unnecessary clutter.**
