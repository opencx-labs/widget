# Widget animation plans

The session plan was the requested first priority and is implemented. The remaining items are scoped follow-ups, not completed work.

| Order | Plan                                                      | Status |
| ----- | --------------------------------------------------------- | ------ |
| 1     | [Animate the session plan](001-plan-card-motion.md)       | DONE   |
| 2     | [Immediate tool activity](002-immediate-tool-activity.md) | TODO   |
| 3     | [Reduced-motion feedback](003-reduced-motion-feedback.md) | TODO   |

Plan 001 builds on the session-isolation fix in widget PR #62 at `d78a05b`. Plans 002 and 003 were inspected at `3aadc86`; recheck their cited callers before implementation. The plan component's own reduced-motion behavior is already covered by plan 001.

No new libraries, model calls or production configuration changes are required for these presentation changes.
