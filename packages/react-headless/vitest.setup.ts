/**
 * React 19 refuses to treat `act()` as a test boundary unless the runtime is
 * told it is one, and warns on every update outside it. It is a property of
 * the test run, not of any one spec, so it is set here once instead of at the
 * top of every file that renders a hook.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
