# @opencx/widget-react

## 5.0.0-beta.0

### Major Changes

- Widget v5 — the streaming agent release.

  **Added**
  - `displayMode: 'companion'`: a bottom-centered pill that morphs into a floating chat panel, a docked sidebar, or a fullscreen column, with every knob under `companion.*` (layouts, resting layout, sidebar side/mode/width, compact geometry, pill label, quick-ask tools, bubbles, scroll lock).
  - The streaming engine, selected by the backend per org: replies stream live with a steps trace and inline rendered UI, can be stopped mid-reply, queue messages sent mid-turn, steer a follow-up into the live turn, retry a failed turn, reconnect after a disconnect, and re-render settled turns faithfully after a reload.
  - `features`: per-embed toggles (`preamble`, `inlineUi`, `dictation`, `pageContext`, `clientTools`) that can only narrow what the organization enabled.
  - `context` accepts a function, resolved at every send, and two well-known keys — `page` and `entity` — the agent reads as "here" and "this"; the entity shows as a removable pill in the composer.
  - Page marks (+ `pageMarkHighlightDurationMs`): when the organization enables it, the visitor marks anything on the host page and the agent can point back at it; an embed opts out with `features.pageContext: false` / `features.clientTools: false`.
  - Voice dictation in the composer, clarification questionnaires that replace the composer while the agent waits on an answer, ↑/↓ recall of sent text.
  - `messageActions.copy`: a Copy button under each AI reply (on by default in the companion, off in the popover so a v4 embed looks the same after upgrading), `router.restoreLastSession`, `onUiAction`, `showStepToolIO`, and an `errorComponent` prop on `Widget` / `WidgetProvider`.
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

### Patch Changes

- Updated dependencies
  - @opencx/widget-core@5.0.0-beta.0
  - @opencx/widget-react-headless@5.0.0-beta.0

## 4.0.62

### Patch Changes

- Align all widget packages on a single shared version. Packages are now version-locked via a changesets fixed group and will always be published together with the same version.
- Updated dependencies
  - @opencx/widget-core@4.0.62
  - @opencx/widget-react-headless@4.0.62

## 4.0.61

### Patch Changes

- Republish the custom status badges feature. The 4.0.60 release of these two packages was skipped by `changeset publish` because 4.0.60 had already been published on Aug 10 (RTL popover fix) without committing the version bump, so the npm 4.0.60 build predates the feature. This release actually ships the custom status badges in the chat screen and sessions list.

## 4.0.60

### Patch Changes

- add custom status badges
- addb7c4: fix: open the chat box on the same side as the trigger button when `theme.widgetTrigger.offset` explicitly pins a side (e.g. `{ right: 20 }` on an RTL page). Previously the trigger honored the explicit offset while the popover anchor and alignment followed the host document direction, so the box opened on the opposite side.
- Updated dependencies
  - @opencx/widget-core@4.0.60
  - @opencx/widget-react-headless@4.0.60

## 4.0.59

### Patch Changes

- enable video attachment
- Updated dependencies
  - @opencx/widget-core@4.0.59
  - @opencx/widget-react-headless@4.0.59

## 4.0.58

### Patch Changes

- replace header button confirmation modal's onConfirmed with onResolved, which fires only after the session is successfully resolved (fixes a race where onConfirmed fired before the resolve request completed)
- Updated dependencies
  - @opencx/widget-core@4.0.58
  - @opencx/widget-react-headless@4.0.58

## 4.0.57

### Patch Changes

- add onConfirmed option for header button confirmation modal
- Updated dependencies
  - @opencx/widget-core@4.0.57
  - @opencx/widget-react-headless@4.0.57

## 4.0.56

### Patch Changes

- add onClicked option for header buttons
- Updated dependencies
  - @opencx/widget-core@4.0.56
  - @opencx/widget-react-headless@4.0.56

## 4.0.55

### Patch Changes

- expose session.title
- Updated dependencies
  - @opencx/widget-core@4.0.55
  - @opencx/widget-react-headless@4.0.55

## 4.0.54

### Patch Changes

- support for csv and excel attachments
- Updated dependencies
  - @opencx/widget-core@4.0.54
  - @opencx/widget-react-headless@4.0.54

## 4.0.53

### Patch Changes

- fix CSAT emoji direction in RTL and add survey translations
- Updated dependencies
  - @opencx/widget-core@4.0.53
  - @opencx/widget-react-headless@4.0.53

## 4.0.52

### Patch Changes

- add hooks.onMessageReceived
- Updated dependencies
  - @opencx/widget-core@4.0.52
  - @opencx/widget-react-headless@4.0.52

## 4.0.51

### Patch Changes

- add accessibility.widgetTriggerButton.label option
- Updated dependencies
  - @opencx/widget-core@4.0.51
  - @opencx/widget-react-headless@4.0.51

## 4.0.50

### Patch Changes

- enable sending while ai is replying
- Updated dependencies
  - @opencx/widget-core@4.0.50
  - @opencx/widget-react-headless@4.0.50

## 4.0.49

### Patch Changes

- enable pdf attachments when talking to ai
- Updated dependencies
  - @opencx/widget-core@4.0.49
  - @opencx/widget-react-headless@4.0.49

## 4.0.48

### Patch Changes

- add zoom in image preview
- Updated dependencies
  - @opencx/widget-core@4.0.48
  - @opencx/widget-react-headless@4.0.48

## 4.0.47

### Patch Changes

- add custom widget trigger component option
- Updated dependencies
  - @opencx/widget-core@4.0.47
  - @opencx/widget-react-headless@4.0.47

## 4.0.46

### Patch Changes

- add hooks when navigating to chat or a new session is created
- Updated dependencies
  - @opencx/widget-core@4.0.46
  - @opencx/widget-react-headless@4.0.46

## 4.0.45

### Patch Changes

- expose widget ref with newChat method
- Updated dependencies
  - @opencx/widget-core@4.0.45
  - @opencx/widget-react-headless@4.0.45

## 4.0.44

### Patch Changes

- fix paste issue on input on mobile
- Updated dependencies
  - @opencx/widget-core@4.0.44
  - @opencx/widget-react-headless@4.0.44

## 4.0.43

### Patch Changes

- add translations
- Updated dependencies
  - @opencx/widget-core@4.0.43
  - @opencx/widget-react-headless@4.0.43

## 4.0.42

### Patch Changes

- add Croatian, Estonian, Latvian, Luxembourgish, and Maltese language translations
- Updated dependencies
  - @opencx/widget-core@4.0.42
  - @opencx/widget-react-headless@4.0.42

## 4.0.41

### Patch Changes

- add translations
- Updated dependencies
  - @opencx/widget-core@4.0.41
  - @opencx/widget-react-headless@4.0.41

## 4.0.40

### Patch Changes

- add message::after custom component
- Updated dependencies
  - @opencx/widget-core@4.0.40
  - @opencx/widget-react-headless@4.0.40

## 4.0.39

### Patch Changes

- add Bulgarian, Czech, Thai, and Vietnamese language translations
- Updated dependencies
  - @opencx/widget-core@4.0.39
  - @opencx/widget-react-headless@4.0.39

## 4.0.38

### Patch Changes

- add Greek and Russian translations
- Updated dependencies
  - @opencx/widget-core@4.0.38
  - @opencx/widget-react-headless@4.0.38

## 4.0.37

### Patch Changes

- add `humanAgent.name` override
- Updated dependencies
  - @opencx/widget-core@4.0.37
  - @opencx/widget-react-headless@4.0.37

## 4.0.36

### Patch Changes

- satisfiy the accessibility police
- Updated dependencies
  - @opencx/widget-core@4.0.36
  - @opencx/widget-react-headless@4.0.36

## 4.0.35

### Patch Changes

- remove unused fonts
- Updated dependencies
  - @opencx/widget-core@4.0.35
  - @opencx/widget-react-headless@4.0.35

## 4.0.34

### Patch Changes

- add `humanAgent.avatarUrl`
- Updated dependencies
  - @opencx/widget-core@4.0.34
  - @opencx/widget-react-headless@4.0.34

## 4.0.33

### Patch Changes

- introduce `bot.avatarUrl` and deprecate `bot.avatar`
- Updated dependencies
  - @opencx/widget-core@4.0.33
  - @opencx/widget-react-headless@4.0.33

## 4.0.32

### Patch Changes

- add `headerTitle` custom component
- Updated dependencies
  - @opencx/widget-core@4.0.32
  - @opencx/widget-react-headless@4.0.32

## 4.0.31

### Patch Changes

- Rename `specialComponents` to `customComponents`
- Updated dependencies
  - @opencx/widget-core@4.0.31
  - @opencx/widget-react-headless@4.0.31

## 4.0.30

### Patch Changes

- add `WidgetConfig.specialComponents.headerBottom`
- Updated dependencies
  - @opencx/widget-core@4.0.30
  - @opencx/widget-react-headless@4.0.30

## 4.0.29

### Patch Changes

- fix avatar url for bot persistable initial messages
- Updated dependencies
  - @opencx/widget-core@4.0.29
  - @opencx/widget-react-headless@4.0.29

## 4.0.28

### Patch Changes

- handle unexpected AI errors more gracefully
- Updated dependencies
  - @opencx/widget-core@4.0.28
  - @opencx/widget-react-headless@4.0.28

## 4.0.27

### Patch Changes

- fix loading state when awaiting bot reply
- Updated dependencies
  - @opencx/widget-react-headless@4.0.27
  - @opencx/widget-core@4.0.27

## 4.0.26

### Patch Changes

- enhance parsing sessionCustomData
- Updated dependencies
  - @opencx/widget-core@4.0.26
  - @opencx/widget-react-headless@4.0.26

## 4.0.25

### Patch Changes

- add translations for Danish, Finnish, Italian, Norwegian, Romanian and Swedish
- Updated dependencies
  - @opencx/widget-core@4.0.25
  - @opencx/widget-react-headless@4.0.25

## 4.0.24

### Patch Changes

- make @opencx/widget dep free
- eb2b209: cleanup @opencx/widget deps
- Updated dependencies
- Updated dependencies [eb2b209]
  - @opencx/widget-core@4.0.24
  - @opencx/widget-react-headless@4.0.24

## 4.0.24-prerelease.0

### Patch Changes

- cleanup @opencx/widget deps
- Updated dependencies
  - @opencx/widget-react-headless@4.0.24-prerelease.0
  - @opencx/widget-core@4.0.24-prerelease.0

## 4.0.23

### Patch Changes

- Add polish translations
- Updated dependencies
  - @opencx/widget-core@4.0.23
  - @opencx/widget-react-headless@4.0.23

## 4.0.22

### Patch Changes

- remove incompatible regex with safari<16
- Updated dependencies
  - @opencx/widget-core@4.0.22
  - @opencx/widget-react-headless@4.0.22

## 4.0.21

### Patch Changes

- do not hardcode non verified name as anonymous
- Updated dependencies
  - @opencx/widget-core@4.0.21
  - @opencx/widget-react-headless@4.0.21

## 4.0.20

### Patch Changes

- add chatBottomComponents
- Updated dependencies
  - @opencx/widget-core@4.0.20
  - @opencx/widget-react-headless@4.0.20

## 4.0.19

### Patch Changes

- add WidgetConfig.chatFooterItems
- Updated dependencies
  - @opencx/widget-core@4.0.19
  - @opencx/widget-react-headless@4.0.19

## 4.0.18

### Patch Changes

- overridable translations
- Updated dependencies
  - @opencx/widget-core@4.0.18
  - @opencx/widget-react-headless@4.0.18

## 4.0.17

### Patch Changes

- publish embed under `@opencx/widget` just like it was before
- Updated dependencies
  - @opencx/widget-core@4.0.17
  - @opencx/widget-react-headless@4.0.17

## 4.0.16

### Patch Changes

- enrich props for special components
- Updated dependencies
  - @opencx/widget-core@4.0.16
  - @opencx/widget-react-headless@4.0.16

## 4.0.15

### Patch Changes

- remove dependency on `prelude` endpoint
- Updated dependencies
  - @opencx/widget-react-headless@4.0.15
  - @opencx/widget-core@4.0.15

## 4.0.14

### Patch Changes

- fix special component when session is resolved
- Updated dependencies
  - @opencx/widget-core@4.0.14
  - @opencx/widget-react-headless@4.0.14

## 4.0.13

### Patch Changes

- add `WidgetConfig.specialComponents`
- Updated dependencies
  - @opencx/widget-core@4.0.13
  - @opencx/widget-react-headless@4.0.13

## 4.0.12

### Patch Changes

- fix fetching csat requested system message
- Updated dependencies
  - @opencx/widget-core@4.0.12
  - @opencx/widget-react-headless@4.0.12

## 4.0.11

### Patch Changes

- add csat survey
- Updated dependencies
  - @opencx/widget-react-headless@4.0.11
  - @opencx/widget-core@4.0.11

## 4.0.10

### Patch Changes

- persist initial messages in db
- Updated dependencies
  - @opencx/widget-core@4.0.10
  - @opencx/widget-react-headless@4.0.10

## 4.0.9

### Patch Changes

- fix portal and dialogs
- Updated dependencies
  - @opencx/widget-core@4.0.9
  - @opencx/widget-react-headless@4.0.9

## 4.0.8

### Patch Changes

- add WidgetConfig.chatBannerItems
- Updated dependencies
  - @opencx/widget-core@4.0.8
  - @opencx/widget-react-headless@4.0.8

## 4.0.7

### Patch Changes

- add timestamps for message groups
- Updated dependencies
  - @opencx/widget-core@4.0.7
  - @opencx/widget-react-headless@4.0.7

## 4.0.6

### Patch Changes

- read version from local package.json
- Updated dependencies
  - @opencx/widget-core@4.0.6
  - @opencx/widget-react-headless@4.0.6

## 4.0.5

### Patch Changes

- bump up version
- Updated dependencies
  - @opencx/widget-core@4.0.5
  - @opencx/widget-react-headless@4.0.5

## 4.0.4

### Patch Changes

- fix portal position
- Updated dependencies
  - @opencx/widget-core@4.0.4
  - @opencx/widget-react-headless@4.0.4

## 4.0.3

### Patch Changes

- add rtl support
- Updated dependencies
  - @opencx/widget-core@4.0.3
  - @opencx/widget-react-headless@4.0.3

## 4.0.2

### Patch Changes

- add `borderRadius: 100%` for widget iframe
- Updated dependencies
  - @opencx/widget-core@4.0.2
  - @opencx/widget-react-headless@4.0.2

## 4.0.1

### Patch Changes

- enable externally controlling the `close-widget` header button
- Updated dependencies
  - @opencx/widget-core@4.0.1
  - @opencx/widget-react-headless@4.0.1

## 4.0.0

### Major Changes

- monorepo setup

### Patch Changes

- Updated dependencies
  - @opencx/widget-core@4.0.0
  - @opencx/widget-react-headless@4.0.0
