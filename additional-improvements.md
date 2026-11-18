# Additional Core Requirement — Location-Based Automatic Allocation and Time-Bounded Recurring Bookings

Act as a senior transportation-dispatch algorithm engineer. Implement a deterministic, auditable, capacity-aware employee allocation engine inside the existing NestJS Central Transport Core.

This feature is a core part of the ETMS. Its purpose is to eliminate manual employee selection and passenger counting for fleet operators.

Preserve the existing technology stack and extend existing modules rather than creating duplicate systems.

## 1. Vehicle capacity

Vehicle passenger capacity excludes the driver.

- Sedan: maximum 4 employee passengers.
- SUV: maximum 6 employee passengers.

Capacity must be configurable per vehicle, with vehicle-specific overrides.

Never exceed the configured capacity.

## 2. Location-first employee grouping

Employees must initially be grouped according to their pickup locations.

Example:

- Aryan: Chinthal
- Suhas: locality near Chinthal
- Priya: Chinthal
- Basha: Chinthal
- Durga: Hayathnagar

Expected result:

- Chinthal becomes a primary locality group.
- Suhas can be considered for the Chinthal group if geographical proximity, travel direction, route compatibility, and time constraints permit.
- Hayathnagar becomes a separate locality group unless its employees can be combined through a valid route.

Do not depend exclusively on manually entered locality names.

Implement canonical locality identification using geocoded employee coordinates and configurable locality records. Normalize locality names and aliases to avoid duplicate groups caused by spelling differences.

Use PostGIS for geographical comparisons and spatial queries.

Implement configurable proximity and route-detour thresholds. Do not treat straight-line distance as actual road distance.

Employees must only be grouped together when these conditions are compatible:

- Same organization and transport eligibility.
- Same travel date.
- Compatible direction and destination.
- Compatible shift.
- Compatible pickup time windows.
- Geographic proximity.
- Available vehicle capacity.

The grouping engine should prefer exact locality matches before considering nearby localities.

## 3. Driver allocation based on locality similarity

Maintain an operational starting or base location for each driver. Where business policy requires matching drivers by their residential locality, support a protected locality-level representation without exposing unnecessary residential-address data.

After generating employee locality groups:

1. Find eligible drivers whose operational starting locality matches the employee group's pickup locality.
2. Check driver availability for the exact proposed trip interval.
3. Check driver qualification, vehicle availability, vehicle category, and capacity.
4. Prefer an available driver from the same locality.
5. If no matching driver is available, find the nearest eligible available driver.
6. Rank other eligible drivers by geographical proximity and estimated deadhead distance.
7. Allocate the first feasible driver and vehicle combination.
8. If no feasible driver exists, leave the group unallocated and explain why.

Do not treat driver allocation as a global Boolean.

A driver assigned to a morning trip may be available for an evening trip. Availability must be evaluated using overlapping time intervals and configurable turnaround buffers.

Never assign a driver to two trips with overlapping or operationally impossible schedules.

Where an existing assigned vehicle has spare capacity, evaluate whether additional compatible employees can be added before creating another vehicle trip. Never violate the published route or passenger time constraints.

## 4. Allocation optimization

Apply hard constraints before optimization.

Hard constraints:

- Employee passenger capacity.
- Driver availability.
- Vehicle availability.
- Organization and transport eligibility.
- Trip direction and destination.
- Pickup time compatibility.
- Shift and trip duration.
- Operational turnaround time.

Optimization priorities:

1. Prefer exact locality matches.
2. Minimize driver deadhead distance.
3. Minimize total pickup route distance.
4. Minimize passenger detours and total journey time.
5. Use available vehicle capacity efficiently.
6. Avoid assigning unnecessary additional vehicles.
7. Balance driver workload fairly.

The engine must return a proposed allocation with its reasons and relevant metrics.

Do not claim globally optimal road routes when road-network routing data is unavailable.

Use deterministic allocation rules and record the rules, configuration, and results used for each dispatch generation. AI or an LLM must not independently make unvalidated passenger assignments.

## 5. Booking duration and recurring reservations

Employees must be able to make:

- One-day bookings.
- Weekly bookings.
- Monthly bookings.
- Custom date-range bookings.

Each booking must contain:

- Employee ID.
- Organization ID.
- Pickup coordinates and locality.
- Destination coordinates.
- Travel direction.
- Requested pickup time.
- Applicable shift.
- Recurrence type.
- Start date.
- End date.
- Selected working days, when recurring.
- Timezone.
- Booking status.

When a weekly, monthly, or custom booking is submitted, generate individual date-specific ride reservations.

Default behavior:

- The booking begins on the next local calendar day unless an explicitly selected start date or approved same-day booking policy applies.
- Weekly duration uses calendar-week duration.
- Monthly duration uses calendar-month arithmetic rather than assuming every month has 30 days.
- Custom duration uses the employee's selected start and end dates.
- The employee can select the applicable working days.

Show a clear booking calendar preview before confirmation.

For each generated ride reservation, preserve the requested pickup time. Do not silently change the employee's requested time.

Where shared routes require sequential pickups, calculate planned stop times separately and enforce configurable time-window tolerances.

Keep requested pickup time, planned pickup time, and actual pickup time as separate values.

## 6. Individual reservation lifecycle

Do not attach an employee permanently to a driver.

Use a recurring booking or booking series to generate date-specific ride reservations.

Each date-specific reservation must have its own lifecycle:

- Pending.
- Confirmed.
- Allocated.
- Published.
- In progress.
- Completed.
- Cancelled.
- Expired.
- No-show, where applicable.

Each dispatch trip must contain its own passenger assignments.

When a booking reaches its expiry date:

- Mark the booking series expired or inactive.
- Stop generating new reservations.
- Do not include the employee in any future pickup manifests from that series.
- Remove or cancel future unstarted assignments according to configured dispatch-cutoff and cancellation policies.
- Preserve completed reservations, trip history, audit records, and billing records.
- Do not delete historical employee or trip records.

When the employee books again, create a new booking series and generate new date-specific reservations. The employee becomes eligible for automatic allocation again.

Prevent overlapping active booking series from creating duplicate reservations for the same employee, travel date, direction, and service period. Provide clear conflict detection and resolution.

## 7. Changes and recalculation

Support employee changes:

- Cancel a specific date without cancelling the entire series.
- Skip selected dates.
- Change a future pickup location.
- Change a future pickup time.
- Extend or renew a booking.
- Cancel the entire remaining series.

Changes must affect only the applicable future reservations.

When bookings change, identify impacted trips and generate revised allocation suggestions.

Do not silently alter published assignments. Require authorized operator approval according to the dispatch policy and notify affected employees and drivers after publication.

Maintain an audit trail of booking changes, allocation decisions, manual overrides, and publications.

## 8. Fleet operator experience

The fleet operator should not manually count employees or construct passenger lists.

Provide a dispatch workspace with:

- Confirmed booking count.
- Locality groups.
- Suggested sedan and SUV requirements.
- Suggested driver and vehicle.
- Driver locality match.
- Driver availability.
- Passenger capacity utilization.
- Estimated trip distance.
- Unallocated bookings.
- Allocation warnings.
- Conflicting reservations.
- Manual override controls.
- Approve and publish actions.

Display why each driver was selected, including locality match, distance ranking, and availability result.

Provide an explicit explanation for every unallocated group.

## 9. Required tests

Test at minimum:

- Employees from the same locality are grouped.
- Employees from nearby localities are grouped only when compatible.
- Different destinations are not incorrectly combined.
- A Chinthal driver is preferred for a Chinthal group when eligible.
- An already scheduled driver is skipped when their time interval conflicts.
- The next nearest eligible driver is selected.
- A driver can receive non-overlapping morning and evening trips.
- Sedan capacity never exceeds four employees.
- SUV capacity never exceeds six employees.
- Recurring weekly and monthly bookings generate correct individual reservations.
- Bookings expire correctly.
- Expired employees do not appear in future pickup lists.
- Historical reservations remain intact.
- Rebooking after expiry creates new reservations.
- Duplicate recurring reservations are prevented.
- Published trips are not silently reassigned.
- Concurrent dispatch operations cannot allocate the same driver or vehicle to conflicting trips.

Provide migrations, DTOs, services, tests, API contracts, and frontend integration points that fit the actual repository architecture.

### Additional Feature — Dynamic Pickup/Arrival Time Selector

Implement a custom, animated, accessible two-position sliding selector in the Employee Flutter application.

The booking screen must first allow employees to choose their journey direction:

- Home → Office
- Office → Home

Then display a contextual two-position selector:

- Pickup time
- Arrival time

The selector's labels, icons, explanations, and time-field descriptions must dynamically change according to the selected journey direction.

Examples:

Home → Office:
- Pickup time: "Pick me up from home around..."
- Arrival time: "Get me to the office by..."

Office → Home:
- Pickup time: "Pick me up from the office around..."
- Arrival time: "Get me home by..."

Store these as separate backend fields:

- `direction`
- `time_preference`
- `requested_time`
- `timezone`

Use `PICKUP_AT` and `ARRIVE_BY` as the time preference values.

Preserve the time preference across all date-specific reservations generated by a recurring booking unless an employee explicitly modifies an individual date.

For `PICKUP_AT`, use a configurable pickup time window rather than assuming every shared-route passenger can be collected at precisely the same minute.

For `ARRIVE_BY`, calculate feasible pickup and departure times using the proposed route's estimated duration, stop sequence, waiting time, and configurable safety buffer.

Never silently promise an infeasible arrival deadline. Flag the reservation for operator review when necessary.

Display a booking preview explaining the selected journey, time preference, first applicable date, final applicable date, and selected working days.

Ensure the selector works with screen readers, touch input, large text, and Android accessibility settings.

**My recommendation: Keep this selector consistent across weekly, monthly and custom bookings. It makes the booking experience simple for employees while giving the dispatch engine the scheduling information it needs.**