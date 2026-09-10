// Which mode a "both" user wants the app to open in by default — NOT the same as
// User.role, which gates what an account can do at all. See WorkPool_Build_Plan.md Sprint 2.
export enum PreferredRole {
  DRIVER = 'driver',
  PASSENGER = 'passenger',
  EITHER = 'either',
}
