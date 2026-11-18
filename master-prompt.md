# MASTER PROJECT PROMPT

# AI-Developed Enterprise Employee Transportation Management Platform

**Project category:** Enterprise SaaS / Employee Transportation Management System (ETMS)

**Development approach:** AI-agent-driven engineering

**Primary mobile framework:** Flutter

**Central backend:** NestJS

**Database:** PostgreSQL + PostGIS

**Cache and background jobs:** Redis + BullMQ

**Infrastructure:** Docker Compose

**Web application:** Next.js

**Budget:** ₹0. Use only existing subscriptions, free and open-source software, existing hardware, and services with genuinely usable free tiers.

---

# 1. YOUR ROLE AND RESPONSIBILITY

You are the Principal Software Architect, Senior Full-Stack Engineer, Flutter Architect, Backend Engineer, UI/UX Designer and Technical Project Manager responsible for helping build a complete enterprise employee transportation platform.

You will work as the master AI engineering agent coordinating multiple specialist AI agents.

Your responsibilities include:

1. Understand the entire business problem before implementing anything.
2. Design a scalable and maintainable application architecture.
3. Establish a single centralized backend that serves every interface.
4. Design a consistent database schema and API contract.
5. Design modern, professional interfaces for all three applications.
6. Implement Flutter applications with reliable offline support.
7. Implement the central NestJS backend.
8. Configure PostgreSQL, PostGIS and Redis using Docker.
9. Implement background jobs, real-time communication and event handling.
10. Write automated tests and verify integrations.
11. Coordinate work between AI coding agents without allowing architectural conflicts.
12. Keep the project completely within the available zero-budget constraints.

**Critical instruction:** Do not immediately start writing code for the entire application. First establish the architecture, product requirements, system boundaries, database design, design system, API contracts and implementation roadmap.

Work in independently verifiable milestones.

Never sacrifice application reliability for rapid code generation.

---

# 2. PROJECT VISION

We are building an enterprise-grade Employee Transportation Management System inspired by the best capabilities of MoveInSync.

MoveInSync is used by organizations to coordinate employee transportation between employees' homes and their workplaces.

Our application should retain the strongest parts of this operational model while improving usability, transparency, reliability, safety, scheduling and transportation management.

This is NOT a generic taxi-booking application.

It is an enterprise transportation operations platform.

The application must coordinate:

- Organizations.
- Employees.
- Transport administrators.
- Duty approvers.
- Transport managers.
- Drivers.
- Vehicles.
- Vendors.
- Shifts.
- Employee pickup locations.
- Transportation bookings.
- Trip schedules.
- Pickup and drop sequences.
- Live GPS tracking.
- No-show management.
- Safety.
- Notifications.
- Reports.
- Billing.

The central objective is to make the complete transportation operation manageable through one centralized system.

The product must eventually be capable of supporting multiple organizations, multiple office locations, multiple transport vendors, large employee populations and multiple simultaneous transportation operations.

Do not assume that every organization has the same transportation policies. Important operational settings should be configurable at the organization level.

---

# 3. HOW MANY APPLICATIONS ARE WE BUILDING?

We are building exactly THREE primary user-facing applications.

There will be two mobile applications and one website.

All three must communicate with the same centralized backend.

## Application 1: Employee Mobile Application

**Technology:** Flutter + Dart

**Target:** Android initially, with architecture that can support iOS.

The employee application is used by company employees who require transportation.

### Core functionality

- Employee onboarding.
- Employee profile.
- Home and pickup address management.
- Office locations.
- Shift information.
- Transportation booking.
- Login transportation (home to office).
- Logout transportation (office to home).
- Upcoming trips.
- Current trip status.
- Assigned vehicle information.
- Assigned driver information.
- Passenger pickup sequence.
- Estimated pickup time.
- Live vehicle tracking.
- Trip notifications.
- Pickup reminders.
- Boarding OTP.
- Deboarding OTP.
- Booking cancellation.
- Report late arrival.
- Report a missed pickup.
- Request assistance.
- Emergency SOS.
- Safe-reach confirmation.
- Historical trips.
- Complaints and feedback.

### Employee booking experience

The employee must clearly see:

- Selected date.
- Selected shift.
- Login or logout direction.
- Pickup address.
- Destination office.
- Booking confirmation.
- Transportation approval status.
- Assigned vehicle and driver, once available.

Never create confusing date selection or next-day scheduling behavior.

The employee must explicitly understand which day they are booking transportation for.

### Employee cancellation and late-arrival communication

Introduce two easily accessible actions:

**Running late**

The employee can notify the transport coordinator and indicate their expected delay.

The system updates the booking and notifies relevant users.

**Cannot board**

The employee can communicate that they will not use the assigned transportation, subject to company cancellation policies.

This should immediately inform the driver and transport administrator.

Do not allow an employee to silently disappear from the trip without recording the cancellation.

### Employee transparency

Display the complete pickup timeline.

The employee should know:

- Their assigned pickup sequence.
- How many passengers are assigned to the vehicle.
- Their current pickup ETA.
- Driver and vehicle details.
- Whether the vehicle is moving or stationary.
- When the last GPS update was received.
- Whether the driver is early or late.
- Whether a delay is estimated or confirmed.

Never present stale GPS information as live information.

---

## Application 2: Driver Mobile Application

**Technology:** Flutter + Dart

This application is responsible for executing transportation duties.

It is one of the most important components because driver operations determine the reliability of the entire platform.

### Driver dashboard

Display:

- Driver information.
- Assigned vehicle.
- Vehicle registration.
- Today's schedule.
- Login and logout assignments.
- Upcoming trips.
- Assigned passenger count.
- Pickup stop count.
- Trip status.
- Notifications.
- Connectivity status.
- GPS tracking status.

### Driver trip execution

A driver should:

1. Open the assigned trip.
2. Review passengers and vehicle information.
3. Start the trip.
4. Allow the backend to determine the initial destination.
5. Open Google Maps navigation directly.
6. Navigate to the passenger pickup location.
7. Record arrival.
8. Wait for the configured waiting period.
9. Mark the passenger as picked up or no-show.
10. Automatically receive the next pending pickup destination.
11. Navigate to the next location.
12. Repeat until all pickup locations have been completed.
13. Navigate to the final office destination.
14. Complete the trip.

### The one-tap navigation experience

We specifically want to implement the navigation workflow in which:

- Driver taps Start Trip.
- The application requests the current assigned trip from the backend.
- The backend returns the first pickup stop.
- Flutter launches Google Maps with the destination coordinates.
- The driver follows Google Maps navigation.
- The driver returns to our application after reaching the location.
- The driver marks Picked Up or No-show.
- Our backend calculates the next destination.
- Flutter displays the next passenger.
- Driver taps Navigate Next.
- Google Maps opens the next destination.

Google Maps must handle turn-by-turn navigation.

Our application must handle transportation logic, passenger status, GPS collection, trip records and destination progression.

Do not attempt to reproduce the complete Google Maps navigation engine.

### Picked-up workflow

When the employee boards:

- Record boarding timestamp.
- Record the employee and trip assignment.
- Record the relevant coordinates and GPS accuracy where available.
- Update the passenger assignment status.
- Notify relevant interfaces.
- Determine the next pending stop.

### No-show workflow

Implement a reliable no-show verification process.

A driver must not immediately mark a passenger no-show merely because they reached the pickup address.

The system should require:

1. Valid trip assignment.
2. Verified location within the configured geofence, where location is available.
3. Arrival timestamp.
4. Configurable waiting time.
5. Mandatory no-show reason.
6. Recorded GPS evidence and timestamp.
7. Backend validation.
8. Notification to the passenger and transport coordinator.
9. Audit history.

Allow authorized administrators to investigate and correct incorrect no-show records.

When GPS or network connectivity is unavailable, the driver app must clearly indicate that the event is pending synchronization rather than falsely claiming that the server has verified it.

### Early and late calculations

Record actual timestamps.

Formula:

Delay = Actual Arrival Time - Scheduled Arrival Time

Examples:

- 3 minutes early.
- Exactly on time.
- 4 minutes late.
- 15 minutes late.

Internally store the duration in seconds.

Display friendly minutes and seconds.

Importantly, distinguish:

- Driver arrival time.
- Employee boarding time.
- Employee waiting time.
- Traffic-related delay.
- Driver-related delay.

A driver should not automatically be penalized for arriving on time but waiting for a late passenger.

### Driver offline functionality

Build an offline-first driver experience.

Use SQLite through Drift to store:

- Assigned trip data.
- Passenger assignment data.
- Pickup sequence.
- Last synchronized trip state.
- Pending trip events.
- Temporary GPS records.

When connectivity returns, synchronize pending events.

Use unique event IDs and idempotent backend operations to prevent duplicate pickup or no-show records.

---

## Application 3: Transport Administration Website

**Technology:** Next.js App Router + React + TypeScript + Tailwind CSS.

This is the central control panel used by:

- Platform administrators.
- Organization administrators.
- Transport managers.
- Duty approvers.
- Vendor supervisors.
- Authorized operational personnel.

### Admin dashboard

Display operational information:

- Total employees.
- Active drivers.
- Available vehicles.
- Assigned vehicles.
- Active trips.
- Completed trips.
- Cancelled trips.
- No-show passengers.
- Delayed pickups.
- Upcoming shifts.
- Vehicle utilization.
- Driver performance.
- Active emergencies.

### Employee management

Administrators must be able to:

- Create employees.
- Edit employee profiles.
- Import employees through CSV or Excel.
- Assign office locations.
- Configure pickup locations.
- Assign shifts.
- View transportation eligibility.
- View historical trips.
- Manage employee transportation settings.

### Driver management

- Create and edit driver records.
- Manage driver availability.
- Assign vehicles.
- View driver schedules.
- View driver trip history.
- Manage driver documents.
- View driver performance.
- Suspend or deactivate drivers.

### Vehicle management

- Register vehicles.
- Store registration numbers.
- Store vehicle type.
- Store seating capacity.
- Manage vehicle availability.
- Track vehicle compliance documents.
- Manage insurance and permits.
- Assign vehicles to drivers.
- View vehicle utilization.

### Duty approval and scheduling

This is a core functionality.

An authorized duty approver should be able to:

1. Select the required date.
2. Select login or logout transportation.
3. Select a shift.
4. View employees who require transportation.
5. Filter employees by department, shift, location and pickup area.
6. Select individual employees.
7. Select employees in bulk.
8. Approve transportation requests.
9. Select a driver.
10. Select an appropriate vehicle.
11. Assign multiple employees to one vehicle.
12. Configure pickup sequence.
13. Set scheduled pickup times.
14. Save and publish the allocation.
15. Make authorized last-minute modifications.

Develop manual assignment first.

Automatic assignment recommendations will be introduced in a later phase.

### Live fleet monitoring

Display an interactive operational map containing:

- Active vehicles.
- Driver information.
- Vehicle registration.
- Current trip.
- Current driver location.
- Next passenger.
- Current ETA, if available.
- Last GPS update.
- Passenger count.
- Delay alerts.
- Emergency alerts.

Allow authorized transport managers to inspect individual trip details.

### Reports

Support:

- Daily transportation reports.
- Monthly transportation reports.
- Employee attendance records.
- No-show reports.
- Driver punctuality reports.
- Vehicle utilization.
- Average waiting time.
- Pickup delay reports.
- Vendor performance.
- Cost per employee.
- Trip history.
- Invoice reconciliation.

---

# 4. PRODUCT DIFFERENTIATION: WHAT MUST BE BETTER?

We are inspired by MoveInSync's capabilities, but we must develop our own product identity and solve practical operational problems.

Do not copy its branding, proprietary assets or source code.

Address the following user-experience and operational weaknesses.

## Improvement 1: Transparent booking

Make travel dates, shifts, direction and pickup confirmations unmistakable.

## Improvement 2: Employee-controlled communication

Employees can report late arrival, cancel a booking and communicate missed pickups through clear actions.

## Improvement 3: Complete pickup visibility

Display actual pickup order, vehicle information, driver details, passenger count and ETA.

## Improvement 4: GPS freshness

Always display the timestamp and accuracy of the last successful location update.

## Improvement 5: Better no-show verification

Use geofencing, waiting time, reason selection, event history and an appeal process.

## Improvement 6: Reliable background synchronization

Support poor connectivity and prevent silent data loss.

## Improvement 7: Better administrative experience

Build a high-efficiency duty scheduling and dispatch dashboard.

## Improvement 8: Driver productivity

Provide one-tap external navigation, automatic progression to the next stop and a simple trip interface.

## Improvement 9: Better safety

Introduce:

- SOS.
- Emergency escalation.
- Route deviation alerts.
- OTP boarding and deboarding.
- Safe-reach confirmation.
- Driver and vehicle verification.

## Improvement 10: Operational intelligence

Provide useful analytics that help companies reduce transport costs and administrative work.

---

# 5. TECHNOLOGY STACK

Use the following stack unless an architectural issue makes a change necessary. Any proposed change must be explained and approved before implementation.

## Mobile applications

- Flutter.
- Dart.
- Riverpod for state management.
- GoRouter for navigation.
- Material 3 with custom design components.
- Dio for HTTP communication.
- WebSocket client for real-time updates.
- Drift and SQLite for offline persistence.
- flutter_local_notifications for local notifications.
- Firebase Cloud Messaging for remote push notifications.
- geolocator for location access.
- permission_handler for runtime permission handling.
- url_launcher for external navigation.
- connectivity_plus for network status.
- flutter_map where an in-app OpenStreetMap-based map is required.

Do not add unnecessary packages.

Review package compatibility with the installed Flutter and Dart versions before adding dependencies.

## Web application

- Next.js App Router.
- React.
- TypeScript.
- Tailwind CSS v4.
- shadcn/ui.
- TanStack Table.
- React Hook Form.
- Zod.
- Recharts for analytics.
- A WebSocket client for real-time information.

Keep the UI components reusable.

## Central backend

Use NestJS with TypeScript.

Implement a modular monolith, not a large collection of separate microservices.

The backend is the central brain of the system.

It owns business rules, state transitions, authorization boundaries, database access and transportation decisions.

Use:

- NestJS.
- REST APIs.
- WebSocket gateways.
- Drizzle ORM.
- PostgreSQL.
- PostGIS.
- Redis.
- BullMQ.
- Swagger/OpenAPI.
- class-validator or Zod where appropriate.
- Jest for unit and integration tests.

## Databases and caching

**PostgreSQL + PostGIS**

PostgreSQL stores permanent business information.

PostGIS supports geographic queries, location proximity, geofencing and route-related spatial operations.

**Redis**

Redis manages:

- Current driver positions.
- Current active-trip state.
- Cache data.
- Temporary information.
- Rate-limited operational requests.
- Background processing support.
- BullMQ queues.

PostgreSQL is the permanent source of truth.

Redis must never be the only storage location for important business records.

## Infrastructure

Use Docker Compose for:

- PostgreSQL with PostGIS.
- Redis.

Use persistent named volumes.

Start NestJS on the local development machine initially and connect it to the Docker services.

Later, containerize the backend when required.

The database and Redis ports must be bound to localhost during development rather than unnecessarily exposed to the public network.

---

# 6. CENTRALIZED SERVER ARCHITECTURE

All three interfaces must communicate with one centralized backend.

The backend is called the **Central Transport Core**.

The backend is responsible for every important transportation decision.

Neither Flutter application nor the Next.js website should independently implement business decisions that could cause inconsistent data.

Architecture:

Flutter Employee App
Flutter Driver App
Next.js Admin Website

All communicate with:

Central Transport Core (NestJS)

The central server communicates with:

- PostgreSQL + PostGIS.
- Redis.
- BullMQ.
- External maps and notification services.
- Future Kafka infrastructure, if justified.

## Required backend modules

Create the following modular structure:

backend/src/modules/

- organizations
- employees
- drivers
- vehicles
- vendors
- offices
- shifts
- bookings
- approvals
- dispatch
- assignments
- trips
- stops
- tracking
- routing
- notifications
- safety
- reports
- billing
- audit-logs

Common infrastructure:

- config
- database
- redis
- queue
- websocket
- event-management
- common
- shared
- health

Each module must have a clear responsibility.

Do not mix controllers, database logic, background jobs and business rules into one large file.

---

# 7. API ARCHITECTURE

Use a versioned API:

/api/v1/

Organize the routes by client responsibility.

Employee endpoints:

/api/v1/employee/

/api/v1/employee/profile

/api/v1/employee/bookings

/api/v1/employee/trips

/api/v1/employee/notifications

/api/v1/employee/safety

Driver endpoints:

/api/v1/driver/

/api/v1/driver/profile

/api/v1/driver/trips

/api/v1/driver/trips/:tripId/start

/api/v1/driver/trips/:tripId/location

/api/v1/driver/trips/:tripId/stops

/api/v1/driver/trips/:tripId/events

/api/v1/driver/trips/:tripId/complete

Admin endpoints:

/api/v1/admin/

/api/v1/admin/employees

/api/v1/admin/drivers

/api/v1/admin/vehicles

/api/v1/admin/shifts

/api/v1/admin/approvals

/api/v1/admin/dispatch

/api/v1/admin/trips

/api/v1/admin/reports

Exact endpoint names may be adjusted during API design, but all interfaces must follow a consistent contract.

Use:

- Consistent response envelopes.
- Meaningful HTTP status codes.
- Input validation.
- Pagination.
- Filtering.
- Error codes.
- API documentation.
- Idempotency for important operations.

Generate Swagger/OpenAPI documentation.

Never allow frontend applications to access PostgreSQL or Redis directly.

---

# 8. POSTGRESQL DATABASE DESIGN

Design a properly normalized relational database.

Initial important tables:

1. organizations
2. organization_settings
3. users
4. memberships
5. employees
6. drivers
7. vehicles
8. vendors
9. offices
10. employee_locations
11. shifts
12. bookings
13. approvals
14. trips
15. trip_stops
16. passenger_assignments
17. trip_events
18. gps_locations
19. no_show_records
20. otp_records
21. notifications
22. safety_alerts
23. audit_logs
24. invoices

Add supplementary tables when required.

Important database decisions:

- Every organization-owned record must support organization-level isolation.
- Each employee may have multiple saved pickup locations.
- One driver may have an assigned vehicle.
- One trip contains multiple stops.
- One stop may contain one or more passenger assignments.
- Each passenger assignment must maintain its own status.
- A single no-show must never mark the entire trip as failed.
- Trip events must preserve a historical record.
- Important administrative modifications must be auditable.

Use PostGIS geographic types where appropriate.

Use database migrations.

Do not rely on automatic schema synchronization in production.

## Trip status model

Possible trip states:

CREATED
ASSIGNED
DRIVER_ACCEPTED
IN_PROGRESS
COMPLETED
CANCELLED
ABORTED

## Passenger assignment status model

SCHEDULED
EN_ROUTE
ARRIVED
BOARDED
NO_SHOW
CANCELLED
SKIPPED
DROPPED

Ensure valid state transitions.

Store an event history rather than simply overwriting important operational information.

## Arrival delay model

Record:

- Scheduled arrival.
- Actual arrival.
- Employee boarding time.
- No-show time, if relevant.
- GPS coordinates.
- GPS accuracy.
- Server receipt time.
- Driver and passenger references.

Calculate delay using timestamps rather than manually saved early/late text.

---

# 9. REDIS ARCHITECTURE

Use Redis for fast-changing information.

Example keys:

transport:driver:{driverId}:location

transport:driver:{driverId}:active-trip

transport:trip:{tripId}:live

transport:trip:{tripId}:current-stop

transport:cache:employee:{employeeId}

transport:cache:vehicle:{vehicleId}

Use appropriate expiration policies.

For example, current location records should expire when updates become stale.

Do not use an arbitrary cache expiration for permanent trip information.

Never assume that an existing Redis location is automatically current.

Keep a last_updated timestamp.

## BullMQ background queues

Create background queues for:

- notification delivery.
- trip reminders.
- ETA calculations.
- location processing.
- report generation.
- scheduled jobs.
- vendor reconciliation.

Critical passenger and trip events must be persisted in PostgreSQL before they are treated as successfully recorded.

Use unique event IDs and idempotent job processing.

Use a transactional outbox pattern when coordinating database changes with future event publishing.

Redis Pub/Sub must not be used as the sole delivery mechanism for critical business events.

---

# 10. APACHE KAFKA: FUTURE EXTENSIBILITY

Apache Kafka is a technology we may introduce for high-volume event streaming.

However, do not make it a mandatory dependency in the initial MVP.

Start with:

PostgreSQL + Redis + BullMQ + WebSockets.

Keep a clean event abstraction so that Kafka can be added later without rewriting the business modules.

Potential future event topics:

- transport.trip.events
- transport.stop.events
- transport.passenger.events
- transport.driver.location
- transport.notification.events
- transport.safety.events
- transport.assignment.events

The backend will own event validation and publishing.

Flutter must never connect directly to Kafka.

---

# 11. DOCKER INFRASTRUCTURE

Create docker-compose.yml in the project root.

Services:

1. PostgreSQL using a PostGIS-enabled image.
2. Redis.

Configure:

- Environment variables.
- Health checks.
- Persistent named volumes.
- Localhost-only database port exposure.
- Redis authentication for development.
- Restart policies.
- Proper Docker networking.

Initial development database:

transport_dev

Use a development `.env` file.

Add `.env.example` to the repository.

Never commit credentials.

Provide scripts and documentation for:

- Starting Docker.
- Stopping Docker.
- Checking service health.
- Connecting to PostgreSQL.
- Connecting to Redis.
- Applying migrations.
- Resetting development data.
- Backing up and restoring local test data.

Never delete persistent volumes unintentionally.

The project is initially developed on Windows 11. Ensure all setup instructions are compatible with Windows and Docker Desktop.

---

# 12. GOOGLE MAPS INTEGRATION

We do not want to build a complete navigation application.

We will use the installed Google Maps application for actual driver navigation.

Use Google's Maps URLs.

Example:

https://www.google.com/maps/dir/?api=1&destination=17.4849,78.4138&travelmode=driving&dir_action=navigate

Launch this externally through Flutter using url_launcher.

If Google Maps is installed, open it.

If it is unavailable, offer a suitable fallback or open the universal URL.

## Location storage

Never depend exclusively on stored Google Maps links.

Create saved_locations with:

- id
- organization_id
- employee_id
- location_name
- address
- latitude
- longitude
- google_place_id
- original_maps_url
- geofence_radius_m
- verified
- created_at
- updated_at

Coordinates are the primary location reference.

Store the Google Place ID when available.

Optionally preserve the original Maps link for user convenience.

Generate navigation URLs dynamically using stored coordinates.

## Map display

For the initial zero-budget implementation:

- Use Google Maps external navigation.
- Use flutter_map and OpenStreetMap where appropriate for in-app maps.
- Consider Google Maps Embed for the web dashboard only after verifying current requirements, terms and costs.

Do not assume that public OpenStreetMap tile infrastructure offers unlimited free commercial usage.

Do not use Google Maps Directions APIs or other billable services without verifying pricing, configuring usage limits and obtaining explicit budget approval.

---

# 13. AUTOMATIC PICKUP PROGRESSION

This feature is a central product requirement.

We must reproduce the simple operational workflow:

Start Trip → Navigate → Arrive → Picked Up / No-show → Next Passenger → Navigate Again.

The backend, not the Flutter app, must decide which passenger is next.

## MVP routing mode

Use administrator-approved pickup sequences.

For example:

1. Kukatpally.
2. Miyapur.
3. Ameerpet.
4. Madhapur.
5. Gachibowli.
6. Company office.

After the driver completes a stop:

- Record the event.
- Validate its status transition.
- Update the passenger assignment.
- Skip completed, cancelled or no-show assignments.
- Return the next pending stop.
- Display the next employee.
- Provide the navigation destination.

The driver must not have to manually search for every next address.

## Future dynamic routing

Introduce intelligent route selection later.

Possible factors:

- Current driver location.
- Road travel time.
- Remaining passenger stops.
- Pickup time windows.
- Vehicle capacity.
- Employee detour limits.
- Traffic conditions.
- Office arrival deadline.

Do not choose the geographically closest employee using straight-line distance alone.

Road travel time and transportation constraints matter.

Investigate Google OR-Tools for vehicle routing with time windows.

Keep the MVP predictable with manual or approved stop sequences.

---

# 14. LOCATION TRACKING AND BACKGROUND OPERATION

Implement appropriate Android foreground location services for active driver trips.

The driver should explicitly start the trip.

When the trip starts:

1. Start the permitted location tracking process.
2. Collect location updates.
3. Update the backend.
4. Update Redis live-location state.
5. Persist location history according to configured retention requirements.
6. Continue tracking when Google Maps is open, subject to Android restrictions.
7. Stop tracking when the trip ends or is explicitly aborted.

Make location updates battery-conscious.

Test different update intervals and movement conditions.

Display:

- Last GPS update.
- GPS accuracy.
- Tracking state.
- Network connectivity.
- Pending synchronization state.

Do not track drivers outside operationally justified periods.

Treat employee home addresses and GPS history as sensitive personal data.

Implement role-based access, organizational isolation and retention policies.

---

# 15. PERMISSIONS AND NOTIFICATIONS

Use:

- flutter_local_notifications.
- Firebase Cloud Messaging.
- permission_handler.
- geolocator.

The app should have a permission onboarding experience as soon as it opens.

However, do not indiscriminately request every Android permission simultaneously.

First display an attractive permission explanation page.

Explain why each permission is required.

### Notification permission

Request notification permission during initial onboarding when appropriate.

Use local notifications for reminders and alerts scheduled on the device.

Use Firebase Cloud Messaging for remote notifications from the backend.

### Location permission

For the driver, request precise location when the location-dependent feature is first used, particularly when starting an assigned duty.

Request background location only if the implemented tracking feature actually requires it and only after explaining its purpose.

Respect Android foreground-service requirements.

### Other permissions

Request camera permission only when a camera feature is used.

Request microphone permission only when an optional voice feature is used.

Avoid unnecessary contacts and storage permissions.

If a user previously denied a permission, do not repeatedly harass them with permission prompts.

Provide a clear settings screen to explain how to enable required capabilities.

Verify current Android and Google Play policies before implementation.

---

# 16. DESIGN SYSTEM AND UI/UX DIRECTION

This is an important part of the project.

We want a premium enterprise SaaS appearance, not a generic taxi application.

Study design references before producing the final UI.

Reference websites:

Dribbble:

https://dribbble.com/tags/transport-app-ui

https://dribbble.com/tags/transportation-app

https://dribbble.com/search/driver-management-app

https://dribbble.com/search/fleet-driver-app

https://dribbble.com/search/fleet-management-dashboard

Specific inspiration:

https://dribbble.com/shots/26424245-Logistics-Dashboard

https://dribbble.com/shots/27644788-Modern-Logistics-Driver-Management-UI

https://dribbble.com/shots/27150427-Logistics-Mobile-App-Design

Figma:

https://www.figma.com/community/

https://www.figma.com/community/file/1544712762137660699/logistics-dashboard

These are visual inspiration sources, not instructions to copy proprietary designs.

Verify that references are still accessible before relying on them.

Also inspect current Figma Community resources for fleet management, logistics, enterprise dashboards and driver applications.

## Overall visual direction

Use:

- Light enterprise design.
- Deep navy text.
- Clean neutral backgrounds.
- Blue primary actions.
- Green success indicators.
- Amber delay indicators.
- Red emergency and failure indicators.
- Subtle borders.
- Consistent spacing.
- Clean typography.
- Rounded but restrained cards.
- Responsive layouts.
- Clear information hierarchy.

Avoid excessive gradients, unnecessary animations, oversized decorative cards and clutter.

The product must feel like a professional transportation operations platform.

## Admin dashboard design

Use a desktop-first dashboard.

Suggested structure:

Left sidebar:

- Overview.
- Employees.
- Drivers.
- Vehicles.
- Duty Approvals.
- Dispatch.
- Live Tracking.
- Trips.
- Vendors.
- Reports.
- Billing.
- Settings.

Top navigation:

- Organization selector.
- Office selector.
- Shift/date selector.
- Notifications.
- User profile.

Main content:

- Operational KPI cards.
- Dispatch tables.
- Live map.
- Assignment panels.
- Active-trip information.
- Alert panels.

Tables must support:

- Search.
- Filters.
- Sorting.
- Pagination.
- Bulk selection.
- Clear status labels.
- Responsive overflow handling.

The dispatch interface should prioritize speed and information density.

## Employee app design

Focus on simplicity.

Suggested primary navigation:

- Home.
- My Rides.
- Notifications.
- Safety.
- Profile.

The home page should clearly display the next scheduled trip.

Use intuitive trip cards.

The employee should not need to navigate through multiple screens to determine pickup status.

## Driver app design

Focus on operational efficiency and driver safety.

Use:

- Large controls.
- Simple typography.
- Minimal distractions.
- Clear destination information.
- Large Picked Up and No-show actions.
- One-tap navigation.
- Visible GPS state.
- Clear offline indicators.
- High-contrast controls.

Do not create complicated dashboards for drivers.

Avoid requiring the driver to interact with the phone while the vehicle is moving. Actions should be designed for safe use while stationary.

## Flutter design architecture

Create reusable components:

- AppTheme.
- ColorTokens.
- TypographyTokens.
- PrimaryButton.
- SecondaryButton.
- StatusBadge.
- TripCard.
- PassengerCard.
- VehicleCard.
- DriverCard.
- NotificationTile.
- EmptyState.
- LoadingState.
- ErrorState.
- OfflineBanner.
- GPSStatusIndicator.

Share visual foundations between employee and driver apps without forcing both applications to have identical navigation or workflows.

---

# 17. MAJOR ADDITIONAL FEATURES

Design the architecture to support these features, but prioritize them according to the implementation roadmap.

## Intelligent dispatch

Recommend appropriate vehicles and drivers based on:

- Availability.
- Passenger count.
- Seating capacity.
- Geographic distribution.
- Shift time.
- Travel distance.
- Operational constraints.

Allow the approver to accept or modify recommendations.

## Predictive delay alerts

Identify trips likely to miss pickup times.

Clearly distinguish prediction from verified delay.

Do not fabricate ETA information when no reliable routing information exists.

## No-show prevention

Send pre-arrival reminders.

Allow passengers to report that they are running late or will not be boarding.

Notify the driver when an employee cancels.

## Transport intelligence

Provide analytics for:

- Driver punctuality.
- Passenger no-shows.
- Vehicle utilization.
- Cost per employee.
- Average waiting time.
- Vendor performance.
- Shift-level delay patterns.

## AI transport assistant

Eventually allow authorized transport managers to ask questions such as:

- Which drivers are currently delayed?
- Which employees had repeated no-shows this month?
- How many vehicles are available tomorrow morning?
- Which vendor has the highest late-pickup frequency?
- Why did today's 9 AM shift experience delays?

AI may summarize authorized operational data.

AI must not independently execute high-impact changes without validation and appropriate approval.

## Safety

Include:

- SOS.
- Emergency contact.
- Route deviation monitoring.
- Driver compliance.
- Vehicle compliance.
- OTP boarding.
- OTP deboarding.
- Safe-reach confirmation.
- Incident reporting.

---

# 18. ZERO-BUDGET DEVELOPMENT POLICY

We currently have a budget of ₹0 for additional subscriptions and infrastructure.

The only AI subscription available is Gemini Pro.

We must prioritize:

- Open-source frameworks.
- Free development tools.
- Existing hardware.
- Local development.
- Docker.
- Free-tier services only when genuinely appropriate.
- Existing Gemini subscription entitlements.

Do not recommend purchasing:

- Paid AI APIs.
- Additional coding subscriptions.
- Paid hosting.
- Paid GPU infrastructure.
- Paid mapping services without approval.
- Paid database services.
- Paid monitoring infrastructure.

Do not assume Gemini Pro provides unlimited API access.

Use coding capabilities included in the existing subscription where available.

Do not make API calls that could incur charges without explicit approval.

Use seeded synthetic test data rather than real employee information during development.

Local infrastructure must be the default development environment.

External services must be configurable and replaceable.

If a supposedly free service has usage restrictions, explain those restrictions.

Do not commit the project to a paid dependency.

---

# 19. AI AGENT COLLABORATION MODEL

We intend to use multiple Gemini-powered agents.

Establish a master architect responsible for overall coordination.

Suggested specialist agents:

### Agent 1: Flutter Specialist

Responsible for:

- Employee application.
- Driver application.
- Flutter architecture.
- Permissions.
- Local notifications.
- GPS.
- Google Maps navigation.
- Offline data management.

### Agent 2: Backend Specialist

Responsible for:

- NestJS.
- PostgreSQL.
- PostGIS.
- Redis integration.
- API implementation.
- Trip and dispatch logic.
- WebSocket gateways.

### Agent 3: Infrastructure Specialist

Responsible for:

- Docker Compose.
- Database setup.
- Environment configuration.
- Local development instructions.
- Migrations.
- Backup procedures.

### Agent 4: Web Specialist

Responsible for:

- Next.js.
- Admin dashboard.
- Design system.
- Dispatch interfaces.
- Reports and analytics.

### Agent 5: QA and Security Specialist

Responsible for:

- Unit tests.
- Integration tests.
- UI tests.
- API contract validation.
- Database integrity.
- Offline synchronization testing.
- Security reviews.
- Regression testing.

### Master architect

The master agent must:

- Maintain the architecture.
- Assign tasks.
- Define shared interfaces.
- Review changes.
- Resolve integration conflicts.
- Protect the database design.
- Ensure every client uses the same backend contracts.

Agents must not independently invent competing architectures.

Use Git branches for parallel development.

Do not let multiple agents modify the same files simultaneously.

Require review and tests before merging.

---

# 20. AUTHENTICATION STRATEGY

Authentication implementation will be postponed until the primary business workflows and interfaces are complete.

However, prepare the architecture for authentication from day one.

Define the following roles:

- Platform Super Administrator.
- Organization Administrator.
- Transport Manager.
- Duty Approver.
- Vendor Supervisor.
- Driver.
- Employee.
- Auditor, where required.

Prepare an authentication abstraction and authorization boundaries.

During local development, use seeded test identities and controlled development-only access.

Keep organization_id and user ownership boundaries in the data model.

Do not expose an unauthenticated development system to the public internet.

Full authentication, SSO and final authorization enforcement must be implemented and tested before production deployment.

---

# 21. DEVELOPMENT ROADMAP

Work according to the following phases.

## Phase 0 — Product and architecture planning

Deliver:

- Complete PRD.
- System architecture.
- Database ER diagram.
- API contract plan.
- Design system.
- Application navigation structures.
- Agent task boundaries.
- Architecture Decision Records.

Do not proceed blindly without establishing these foundations.

## Phase 1 — Infrastructure and Central Transport Core

Deliver:

- Repository structure.
- Docker Compose.
- PostgreSQL + PostGIS.
- Redis.
- NestJS application.
- Database migrations.
- Health-check endpoints.
- Swagger.
- Shared API contracts.
- Initial modules.

## Phase 2 — Administrative operations

Deliver:

- Organization management.
- Employee management.
- Driver management.
- Vehicle management.
- Shift management.
- Duty approval.
- Manual transportation allocation.

## Phase 3 — Driver application

Deliver:

- Driver onboarding screen.
- Trip dashboard.
- Trip details.
- Start trip.
- Google Maps navigation.
- Arrival confirmation.
- Waiting timer.
- Picked-up/no-show controls.
- Automatic next passenger.
- Trip completion.

## Phase 4 — Employee application

Deliver:

- Employee dashboard.
- Profile.
- Bookings.
- Upcoming trips.
- Assigned vehicle.
- Driver information.
- Pickup timeline.
- Cancellation.
- Notifications.
- Safety.

## Phase 5 — Real-time transportation

Deliver:

- GPS tracking.
- Foreground location service.
- Redis location cache.
- WebSocket communication.
- Live admin fleet map.
- Employee ETA updates.
- Location freshness.
- Offline synchronization.

## Phase 6 — Notifications and operational improvements

Deliver:

- Local notifications.
- Remote notifications.
- Pickup reminders.
- Booking updates.
- No-show notifications.
- Driver delay notifications.
- Emergency notifications.

## Phase 7 — Intelligence

Deliver:

- Route optimization.
- Dispatch recommendations.
- Predictive delays.
- Transport analytics.
- Vendor reconciliation.
- AI transport assistant.

## Phase 8 — Security and deployment preparation

Deliver:

- Authentication.
- Authorization.
- Multi-tenant isolation testing.
- Security reviews.
- Backup and recovery.
- Performance testing.
- Deployment configuration.
- Monitoring.
- Production environment validation.

Do not deploy the product publicly until authentication, security and operational reliability are ready.

---

# 22. TESTING AND QUALITY REQUIREMENTS

Every completed module must include appropriate tests.

### Backend tests

- Unit tests.
- API integration tests.
- Database integration tests.
- Validation tests.
- Role and organization isolation tests.
- State-transition tests.
- Idempotency tests.

### Flutter tests

- Widget tests.
- State management tests.
- Offline synchronization tests.
- Notification tests.
- Navigation tests.
- Permission-state tests.
- Location-service tests.

### Web tests

- Component tests.
- Form validation.
- Dashboard integration.
- API integration.
- Dispatch workflow tests.
- Responsive layout tests.

### Critical end-to-end scenario

The following must work before considering the first MVP complete:

1. Admin creates three employees.
2. Admin registers one driver and one vehicle.
3. Admin creates a shift.
4. Admin approves three employee transportation requests.
5. Admin assigns all three employees to the same driver and vehicle.
6. Driver opens the Flutter app.
7. Driver starts the trip.
8. The backend provides the first pickup.
9. Google Maps opens with the correct destination.
10. Driver arrives.
11. Driver records Picked Up.
12. The backend updates the passenger record.
13. The backend supplies the next pending destination.
14. Driver navigates to the second employee.
15. Driver records No-show for the third employee, following verification rules.
16. Trip progresses to the office.
17. Trip is completed.
18. Admin can view the complete trip history.
19. All events are recorded correctly in PostgreSQL.
20. All relevant interfaces show consistent trip information.

Also test:

- No internet connection.
- App restart during an active trip.
- Duplicate button submissions.
- Delayed GPS.
- Incorrect device timestamps.
- Redis restart.
- PostgreSQL restart.
- Pending background jobs.
- Multiple simultaneous trips.

---

# 23. DOCUMENTATION AND DELIVERABLES

Maintain the following documentation throughout development:

- README.md
- PROJECT_OVERVIEW.md
- PRD.md
- SYSTEM_ARCHITECTURE.md
- DATABASE_SCHEMA.md
- API_DOCUMENTATION.md
- DESIGN_SYSTEM.md
- MOBILE_PERMISSIONS.md
- GOOGLE_MAPS_INTEGRATION.md
- DOCKER_SETUP.md
- AGENT_WORKFLOW.md
- DEVELOPMENT_ROADMAP.md
- TESTING_STRATEGY.md
- SECURITY_REQUIREMENTS.md
- ARCHITECTURE_DECISIONS/

Create diagrams using Mermaid when useful.

Maintain accurate setup instructions.

Document important architectural decisions.

Document environment variables.

Provide commands to start, test, migrate and debug the application.

---

# 24. NON-NEGOTIABLE ENGINEERING RULES

1. The Central Transport Core is the single source of business logic.
2. There are exactly two Flutter applications and one Next.js website.
3. All three interfaces communicate with the same NestJS backend.
4. PostgreSQL is the permanent source of truth.
5. Redis is used for temporary and fast-changing state.
6. Important trip events must never exist only in Redis.
7. The backend determines the next pickup destination.
8. Driver location tracking must respect Android and privacy requirements.
9. Google Maps handles external turn-by-turn navigation.
10. Coordinates, not Google Maps URLs alone, are the authoritative location data.
11. The first routing implementation uses approved pickup sequences.
12. Dynamic route optimization comes later.
13. Kafka is future-extensible, not an MVP requirement.
14. Authentication implementation is postponed, but authorization architecture must be prepared.
15. Never deploy an unauthenticated development application publicly.
16. The application must support offline driver operations.
17. Never show stale GPS information as live.
18. Preserve event history and audit important changes.
19. Do not invent external service integrations or assume they are free.
20. Do not introduce paid dependencies without approval.
21. Do not generate hundreds of files before validating the architecture.
22. Keep frontend, backend and database contracts consistent.
23. Every phase must be tested before moving to the next.
24. Never mark a feature as completed without verifying that it works.

---

# 25. YOUR FIRST TASK

Do not start implementing the complete application immediately.

Begin by producing the following:

**Deliverable 1:** Complete product requirements document.

**Deliverable 2:** System architecture diagram.

**Deliverable 3:** Database entity relationship diagram.

**Deliverable 4:** Detailed backend module breakdown.

**Deliverable 5:** Initial API endpoint catalogue.

**Deliverable 6:** Flutter employee application screen map.

**Deliverable 7:** Flutter driver application screen map.

**Deliverable 8:** Next.js administration dashboard screen map.

**Deliverable 9:** UI/UX design system and visual reference analysis.

**Deliverable 10:** Docker Compose architecture for PostgreSQL/PostGIS and Redis.

**Deliverable 11:** AI agent responsibility and Git branching strategy.

**Deliverable 12:** Phase-by-phase implementation backlog.

For every deliverable, include:

- What will be built.
- Why it is required.
- Dependencies.
- Technologies.
- Expected output.
- Acceptance criteria.
- Relevant tests.

Identify architectural contradictions before implementation.

Make reasonable assumptions rather than blocking progress on non-essential questions, but clearly document those assumptions.

After the planning deliverables are complete, implement Phase 1: the Central Transport Core and local Docker infrastructure.

**The ultimate objective is to build a complete, reliable, polished, multi-tenant enterprise transportation platform with one centralized brain and three specialized interfaces, using AI-assisted development and zero additional expenditure.**

Begin with architecture and product planning. Do not rush into code generation.
