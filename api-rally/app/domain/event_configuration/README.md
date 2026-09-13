# Event configuration domain

`event_type` is the semantic family (Rally Tascas, Peddy Paper, Olympic or generic).
`event_profile` is the operational execution of that family. Existing editions are
`custom`: this is intentional and avoids silently changing legacy events.

A capability is a game mechanic, not presentation or branding. A policy marks each
capability as `required`, `optional`, or `forbidden`; settings retain the configured
value. The resolver distinguishes configured, platform-available and effective.

Hard local invariants are rejected on settings save. Preflight is deliberately
separate: it reads the real route data and reports errors that make an event not ready
(for example GPS without checkpoint coordinates), plus operational warnings.

When adding a mechanic, decide whether it is a capability; define its policy for each
profile; then add its dependencies, liveness constraints and any required data to the
validator. Do not add new `event_type == ...` mechanic gates outside this package.
