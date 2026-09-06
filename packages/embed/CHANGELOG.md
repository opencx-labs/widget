# @opencx/widget

## 5.0.0-beta.0

### Major Changes

- Widget v5 — the streaming agent release.

  **Added**
  - `displayMode: 'companion'`: a bottom-centered pill that morphs into a floating chat panel, a docked sidebar, or a fullscreen column, with every knob under `companion.*` (layouts, resting layout, sidebar side/mode/width, compact geometry, pill label, quick-ask tools, bubbles, scroll lock).
  - The streaming engine, selected by the backend per org: replies stream live with a steps trace and inline rendered UI, can be stopped mid-reply, queue messages sent mid-turn, steer a follow-up into the live turn, retry a failed turn, reconnect after a disconnect, and re-render settled turns faithfully after a reload.
  - `features`: per-embed toggles (`preamble`, `inlineUi`, `dictation`, `pageContext`, `clientTools`) that can only narrow what the organization enabled.
  - `context` accepts a function, resolved at every send, and two well-known keys — `page` and `entity` — the agent reads as "here" and "this"; the entity shows as a removable pill in the composer.
  - `enablePageMarks` (+ `pageMarkHighlightDurationMs`): the visitor marks anything on the host page and the agent can point back at it.
  - Voice dictation in the composer, clarification questionnaires that replace the composer while the agent waits on an answer, ↑/↓ recall of sent text.
  - `router.restoreLastSession`, `onUiAction`, `showStepToolIO`, and an `errorComponent` prop on `Widget` / `WidgetProvider`.
  - `components` keys `agent_chat_steps`, `agent_chat_spec`, `agent_chat_questions`; headless `useAgentChatUi`, `useBot`, `useDisplayMode`, `useDictation`, `useWidgetLayout`; React `HostedSpecRenderer` and `segmentContent` for host pages that show widget transcripts.
  - Around 70 new translation keys in all 38 locales.

  **Breaking**
  - The embed is now two files: `dist-embed/script.js` is a tiny loader that injects `dist-embed/widget.js` (an ES module with lazy chunks). Self-hosters must publish the whole `dist-embed` directory with CORS headers.
  - Agent and bot messages, and `chatFooterItems`, are sanitized: inline `style`, `<script>`, `<iframe>`, media tags and `data:` images are stripped.
  - `WidgetUserMessage.deliveredAt` was removed (`timestamp` carries the same instant); `pending` and `markedElements` were added.
  - A failed initialization renders nothing (previously the loading state stayed mounted); pass `errorComponent` to render your own failure surface.
  - `zod` moved from v3 to v4 in `@opencx/widget-react` and `@opencx/widget-react-headless`.
  - Streaming needs an OpenCX backend that returns the `agent` block from `/widget/v2/config`; against an older backend the widget runs the classic engine exactly as v4 did.

  Unchanged: the classic popover, `inline`, `customComponents`, the `components` prop keys of v4, `cssOverrides`/`theme`, `headerButtons`, `hooks`, `ExternalStorage`, storage keys, and the `context` a host passes — it rides along with every send as before.

## 4.0.62

### Patch Changes

- Align all widget packages on a single shared version. Packages are now version-locked via a changesets fixed group and will always be published together with the same version.

## 4.0.61

### Patch Changes

- Republish the custom status badges feature. The 4.0.60 release of these two packages was skipped by `changeset publish` because 4.0.60 had already been published on Aug 10 (RTL popover fix) without committing the version bump, so the npm 4.0.60 build predates the feature. This release actually ships the custom status badges in the chat screen and sessions list.

## 4.0.60

### Patch Changes

- add custom status badges
- addb7c4: fix: open the chat box on the same side as the trigger button when `theme.widgetTrigger.offset` explicitly pins a side (e.g. `{ right: 20 }` on an RTL page). Previously the trigger honored the explicit offset while the popover anchor and alignment followed the host document direction, so the box opened on the opposite side.

## 4.0.59

### Patch Changes

- enable video attachment

## 4.0.58

### Patch Changes

- replace header button confirmation modal's onConfirmed with onResolved, which fires only after the session is successfully resolved (fixes a race where onConfirmed fired before the resolve request completed)

## 4.0.57

### Patch Changes

- add onConfirmed option for header button confirmation modal

## 4.0.56

### Patch Changes

- add onClicked option for header buttons

## 4.0.55

### Patch Changes

- expose session.title

## 4.0.54

### Patch Changes

- support for csv and excel attachments

## 4.0.53

### Patch Changes

- fix CSAT emoji direction in RTL and add survey translations

## 4.0.52

### Patch Changes

- add hooks.onMessageReceived

## 4.0.51

### Patch Changes

- add accessibility.widgetTriggerButton.label option

## 4.0.50

### Patch Changes

- enable sending while ai is replying

## 4.0.49

### Patch Changes

- enable pdf attachments when talking to ai

## 4.0.48

### Patch Changes

- add zoom in image preview

## 4.0.47

### Patch Changes

- add custom widget trigger component option

## 4.0.46

### Patch Changes

- add hooks when navigating to chat or a new session is created

## 4.0.45

### Patch Changes

- expose widget ref with newChat method

## 4.0.44

### Patch Changes

- fix paste issue on input on mobile

## 4.0.43

### Patch Changes

- add translations

## 4.0.42

### Patch Changes

- add Croatian, Estonian, Latvian, Luxembourgish, and Maltese language translations

## 4.0.41

### Patch Changes

- add translations

## 4.0.40

### Patch Changes

- add message::after custom component

## 4.0.39

### Patch Changes

- add Bulgarian, Czech, Thai, and Vietnamese language translations

## 4.0.38

### Patch Changes

- add Greek and Russian translations

## 4.0.37

### Patch Changes

- add `humanAgent.name` override

## 4.0.36

### Patch Changes

- satisfiy the accessibility police

## 4.0.35

### Patch Changes

- remove unused fonts

## 4.0.34

### Patch Changes

- add `humanAgent.avatarUrl`

## 4.0.33

### Patch Changes

- introduce `bot.avatarUrl` and deprecate `bot.avatar`

## 4.0.32

### Patch Changes

- add `headerTitle` custom component

## 4.0.31

### Patch Changes

- Rename `specialComponents` to `customComponents`

## 4.0.30

### Patch Changes

- add `WidgetConfig.specialComponents.headerBottom`

## 4.0.29

### Patch Changes

- fix avatar url for bot persistable initial messages

## 4.0.28

### Patch Changes

- handle unexpected AI errors more gracefully

## 4.0.27

### Patch Changes

- fix loading state when awaiting bot reply

## 4.0.26

### Patch Changes

- enhance parsing sessionCustomData

## 4.0.25

### Patch Changes

- add translations for Danish, Finnish, Italian, Norwegian, Romanian and Swedish

## 4.0.24

### Patch Changes

- make @opencx/widget dep free
- eb2b209: cleanup @opencx/widget deps

## 4.0.24-prerelease.0

### Patch Changes

- cleanup @opencx/widget deps

## 4.0.23

### Patch Changes

- Add polish translations
- Updated dependencies
  - @opencx/widget-core@4.0.23
  - @opencx/widget-react@4.0.23

## 4.0.22

### Patch Changes

- remove incompatible regex with safari<16
- Updated dependencies
  - @opencx/widget-core@4.0.22
  - @opencx/widget-react@4.0.22

## 4.0.21

### Patch Changes

- do not hardcode non verified name as anonymous
- Updated dependencies
  - @opencx/widget-core@4.0.21
  - @opencx/widget-react@4.0.21

## 4.0.20

### Patch Changes

- add chatBottomComponents
- Updated dependencies
  - @opencx/widget-react@4.0.20
  - @opencx/widget-core@4.0.20

## 4.0.19

### Patch Changes

- add WidgetConfig.chatFooterItems
- Updated dependencies
  - @opencx/widget-react@4.0.19
  - @opencx/widget-core@4.0.19

## 4.0.18

### Patch Changes

- overridable translations
- Updated dependencies
  - @opencx/widget-react@4.0.18
  - @opencx/widget-core@4.0.18

## 4.0.17

### Patch Changes

- publish embed under `@opencx/widget` just like it was before
- Updated dependencies
  - @opencx/widget-react@4.0.17
  - @opencx/widget-core@4.0.17
