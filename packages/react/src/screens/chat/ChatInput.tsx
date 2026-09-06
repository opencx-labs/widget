import { type SendMessageDto, log } from '@opencx/widget-core';
import {
  useAgentChatUi,
  useConfig,
  useDictation,
  useIsAwaitingBotReply,
  useMessages,
  useSessions,
  useUploadFiles,
  useWidget,
} from '@opencx/widget-react-headless';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowUpIcon,
  CircleDashed,
  MousePointerClickIcon,
  PaperclipIcon,
  SquareIcon,
} from 'lucide-react';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { MotionDiv } from '../../components/lib/MotionDiv';
import { MotionDiv__VerticalReveal } from '../../components/lib/MotionDiv__VerticalReveal';
import { Button } from '../../components/lib/button';
import { Tooltippy } from '../../components/lib/tooltip';
import { cn } from '../../components/lib/utils/cn';
import { useIsSmallScreen } from '../../hooks/useIsSmallScreen';
import { useTranslation } from '../../hooks/useTranslation';
import {
  pickedElementsFromMarks,
  type PageMark,
} from '../../page-marks/page-mark';
import { awaitSnapshotUrl } from '../../page-marks/mark-thumbnail';
import { PageContextPill } from '../../page-context/PageContextPill';
import { usePageEntity } from '../../page-context/usePageEntity';
import { PageMarkOverlay } from '../../page-marks/PageMarkOverlay';
import { PageMarkPill } from '../../page-marks/PageMarkPill';
import { dc } from '../../utils/data-component';
import {
  formatBinding,
  matchesBinding,
  WIDGET_KEYBINDINGS,
} from '../../utils/keybindings';
import {
  AI_FILE_ACCEPT,
  HANDED_OFF_FILE_ACCEPT,
  MAX_FILE_BYTES,
  UploadPreview,
} from './UploadPreview';
import { QueuedSendsPill } from './agent/QueuedSendsPill';
import { DictationMicButton } from './DictationMicButton';
import { MentionPicker } from './MentionPicker';
import { MentionText } from './MentionText';
import { copyTextLayoutStyles } from './caret-position';
import { useMentions } from './useMentions';
import { usePageMarkComposer } from './usePageMarkComposer';
import { useSentTextRecall } from './useSentTextRecall';

/**
 * The stock composer — white card, multi-line textarea, attach + send.
 * Exported so companion's quick-ask state renders the exact same composer
 * (not a bespoke bar), inheriting every customization automatically.
 */
/**
 * The textarea's box, shared with the mirror that highlights mentions under
 * it: both must wrap the same text at the same places, so width, padding
 * and the growth limit are declared once.
 */
const TEXTAREA_BOX_CLASS = 'max-h-16 [field-sizing:content] w-full px-2';

export function ChatInput({
  trailingActions,
  disableTooltips,
  placeholder,
  hideAttachTools,
}: {
  /**
   * Extra controls rendered in the composer's action row, just before the
   * send button. Companion uses it to slot a conversation-history button into
   * the quick-ask bar; popover mode passes nothing.
   */
  trailingActions?: React.ReactNode;
  /**
   * Suppress the attach/send button tooltips for this composer instance.
   * Companion's quick-ask bar sets it: the shell clips that composer to a thin
   * strip, so a `side="top"` tooltip bleeds above the bar as a dark sliver.
   */
  disableTooltips?: boolean;
  /**
   * Override the composer placeholder. Companion's quick-ask bar uses it to
   * read "Follow up…" while continuing an open conversation. Defaults to the
   * localized "Write a message…".
   */
  placeholder?: string;
  /**
   * Hide the attach + page-mark buttons. Companion's docked quick-ask
   * bar sets it so the resting composer carries ONLY the history control —
   * the full tool row lives in the expanded chat panel.
   */
  hideAttachTools?: boolean;
} = {}) {
  const { isSmallScreen } = useIsSmallScreen();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRootRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const { sendMessage, rememberSentText, getSentTextHistory } = useMessages();
  const { widgetCtx, componentStore } = useWidget();
  // Org features narrowed by the embed: no attachments → no paperclip, no
  // drop, no paste; no page marks → no mark button.
  const { attachments: canAttach, pageContext: pageMarksEnabled } =
    widgetCtx.features;
  // Agent-chat streaming state — no-op defaults for bot-chat embeds.
  const { isStreaming, stop, queuedUserMessages, pendingClarification } =
    useAgentChatUi();
  const { sessionState } = useSessions();
  const { mentions: mentionsConfig } = useConfig();
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  // The host page's entity ("this" to the agent). Dismissing the pill drops
  // it from the NEXT send only; it comes back for the message after.
  const pageEntity = usePageEntity();
  // @-mentions: things on the host the visitor names in the message.
  const mentions = useMentions({
    text: inputText,
    setText: setInputText,
    inputRef,
  });
  const hasMentionsInDraft = mentions.picked.length > 0;
  // The mirror wears the textarea's resolved font and padding, not the
  // classes it was written with: an embedder's `cssOverrides` on the
  // textarea (a 13px composer, say) must move the highlight with the text.
  useLayoutEffect(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (!input || !mirror) return;
    copyTextLayoutStyles(input, mirror);
  }, [hasMentionsInDraft, inputText]);
  const [pageEntityDismissed, setPageEntityDismissed] = useState(false);
  const [fileSelectionError, setFileSelectionError] = useState<string | null>(
    null,
  );
  // Dictation reads/writes the composer between renders, so it goes through
  // a ref that mirrors state synchronously (the drip must see its own write).
  const inputTextRef = useRef(inputText);
  inputTextRef.current = inputText;
  const handleSubmitRef = useRef<() => void>(() => undefined);
  const dictation = useDictation({
    getValue: () => inputTextRef.current,
    setValue: (value) => {
      inputTextRef.current = value;
      setInputText(value);
    },
    onSend: () => handleSubmitRef.current(),
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ↑/↓ recall of previously sent messages. The history lives on MessageCtx
  // (one widget instance, cleared with the conversation); the walk position
  // lives in the hook.
  const recall = useSentTextRecall({
    inputText,
    setInputText,
    inputRef,
    getSentTextHistory,
  });

  // Page marks: hover an element, click to land an editable mark, attach it
  // as context. Attached marks live OUTSIDE this component — collapsing the
  // panel unmounts the composer.
  const showPageMarks = pageMarksEnabled && !isSmallScreen;
  const pageMarkingEnabled = showPageMarks && hideAttachTools !== true;
  const { marks, detach, marking } = usePageMarkComposer({
    enabled: pageMarkingEnabled,
    inputRef,
  });

  const {
    allFiles,
    handleCancelUpload,
    appendFiles,
    isUploading,
    successFiles,
  } = useUploadFiles();

  const isHandedOff = !!sessionState.session?.isHandedOff;

  const { isAwaitingBotReply } = useIsAwaitingBotReply();
  // The awaiting-AI gate is the non-streaming engine's: a mid-turn send has
  // nowhere to go there, so it is blocked (unless the embedder opts out).
  // The streaming agent surface never blocks — a send mid-turn is queued
  // (multi-send) and drains when the live turn ends or is stopped.
  const shouldBlockSending =
    widgetCtx.messageCtx.blocksSendWhileAwaitingReply && isAwaitingBotReply;

  const handleFileDrop = (acceptedFiles: File[]) => {
    // Drop and paste both land here: nothing is accepted when the org has no
    // attachments (the dropzone is disabled too, this guards the paste path).
    if (!canAttach) return;
    setFileSelectionError(null);
    appendFiles(acceptedFiles);
  };

  // An attached mark is a message on its own — the visitor already said what
  // they mean by drawing on the page and (usually) writing on it, so the
  // composer must not demand the same question typed a second time.
  // Something is riding along with the next message — the page the visitor is
  // on, or regions they drew on it. Drives the fused context tray below.
  const hasAttachedContext =
    marks.length > 0 || (pageEntity !== null && !pageEntityDismissed);

  const cannotSend =
    !inputText.trim() && successFiles.length === 0 && marks.length === 0;

  // The send button's single decision: an empty box mid-stream offers stop;
  // anything typed mid-stream sends (queues). Otherwise the button sends,
  // subject to uploads and the non-streaming awaiting-reply gate.
  const showStop = isStreaming && cannotSend;
  // Enter on an EMPTY composer is the queue's flush: stopping the live turn is
  // what starts the next queued message, which is exactly what the ⏎ hint on
  // the queue pill advertises. Gated on a non-empty queue so a stray Enter
  // never kills a response nobody is waiting to follow up on — the send
  // button keeps offering stop unconditionally, a click being deliberate in a
  // way a keystroke is not.
  const flushQueueOnEnter = showStop && queuedUserMessages.length > 0;
  const sendDisabled = isUploading || shouldBlockSending || cannotSend;

  const handleSubmit = () => {
    // A spoken "send it" must not send half a phrase.
    dictation.stop();
    if (shouldBlockSending) return;
    if (cannotSend) return;

    // Sending now would silently drop files still uploading (only
    // `successFiles` ride the payload).
    if (isUploading) return;
    // Everything the send carries is captured NOW: the snapshot wait below
    // yields to the event loop, and the composer may change underneath it.
    const submittedText = inputText;
    const submittedMarks = [...marks];
    const submittedFiles = [...successFiles];
    const submittedFileIds = allFiles.map((file) => file.id);
    // A mark's snapshot upload usually landed while the visitor typed; give a
    // straggler a moment (the URL is written onto the mark itself), then send
    // — a slow upload costs the picture, never the message.
    void Promise.all(
      submittedMarks.map((mark) =>
        awaitSnapshotUrl(mark, SNAPSHOT_UPLOAD_GRACE_MS),
      ),
    ).then(() =>
      submit({
        submittedText,
        submittedMarks,
        submittedFiles,
        submittedFileIds,
      }),
    );
  };

  const submit = ({
    submittedText,
    submittedMarks,
    submittedFiles,
    submittedFileIds,
  }: {
    submittedText: string;
    submittedMarks: PageMark[];
    submittedFiles: typeof successFiles;
    submittedFileIds: string[];
  }) => {
    // Nothing typed but marks attached: their notes ARE the question, and a
    // note-less mark still asks the one thing the tool exists for. Files keep
    // sending with no text at all, as they always have.
    const trimmed =
      submittedText.trim() ||
      (submittedMarks.length > 0
        ? (markNotes(submittedMarks) ?? t('page_mark_default_message'))
        : '');
    let didAccept = false;
    const submittedMentions = mentions.picked;

    // Do not await this
    void sendMessage({
      content: trimmed,
      withPageEntity: !pageEntityDismissed,
      mentions: submittedMentions.length > 0 ? submittedMentions : undefined,
      attachments: submittedFiles.flatMap((f) =>
        f.fileUrl
          ? [
              {
                url: f.fileUrl,
                type: f.file.type,
                name: f.file.name,
                id: f.id,
                size: f.file.size,
              } satisfies NonNullable<SendMessageDto['attachments']>[number],
            ]
          : [],
      ),
      // Page marks ride as AI-visible context, not message text. `page_marks`
      // is the rich payload for THIS turn; `picked_elements` is the key the
      // backend persists, re-surfaces on later turns, and hands back to the
      // surfaces that show the message afterwards.
      clientContext:
        submittedMarks.length > 0
          ? {
              page_marks: submittedMarks,
              picked_elements: pickedElementsFromMarks(submittedMarks),
            }
          : undefined,
      onAccepted: () => {
        if (didAccept) return;
        didAccept = true;

        rememberSentText(trimmed);
        // Page marks live outside this component, so detach the exact marks
        // that rode the accepted send even if the composer has unmounted.
        submittedMarks.forEach((mark) => detach(mark));
        submittedFileIds.forEach((fileId) => handleCancelUpload(fileId));

        if (!mountedRef.current) return;
        recall.onSent();
        setPageEntityDismissed(false);
        mentions.reset();
        setInputText((current) => (current === submittedText ? '' : current));
      },
    }).catch((error: unknown) => {
      log.error('failed to send message', error);
    });
  };

  const {
    getRootProps: dropzone__getRootProps,
    getInputProps: dropzone__getInputProps,
    open: dropzone__openFileSelect,
  } = useDropzone({
    onDrop: handleFileDrop,
    noClick: true,
    disabled: !canAttach,
    onDropRejected() {
      setFileSelectionError(t('file_rejected'));
    },
    maxSize: MAX_FILE_BYTES,
    // Handed-off (human agent) chats accept a wider net of images plus plain
    // text; AI chats take only the formats the models consume.
    accept: isHandedOff ? HANDED_OFF_FILE_ACCEPT : AI_FILE_ACCEPT,
  });

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;
    if (clipboardData.files.length > 0) {
      handleFileDrop(Array.from(clipboardData.files));
    }
  };

  handleSubmitRef.current = handleSubmit;

  // The agent asked something and is waiting on the answer: the questionnaire
  // TAKES THE COMPOSER'S PLACE, so the customer answers where they would
  // otherwise type. It lives here rather than in `ChatFooter` because the
  // companion shell renders `ChatInput` directly and never mounts that footer
  // — one composer, one rule, every surface.
  const QuestionsComponent = componentStore.getComponent(
    'agent_chat_questions',
  );
  if (pendingClarification && QuestionsComponent) {
    return (
      <div {...dc('chat/input_box/root')} className="p-2 relative space-y-1">
        <QuestionsComponent request={pendingClarification} />
      </div>
    );
  }

  return (
    <div
      {...dc('chat/input_box/root')}
      className="p-2 relative space-y-1"
      {...dropzone__getRootProps({ ref: composerRootRef })}
    >
      <input {...dropzone__getInputProps()} />
      {mentions.isOpen && (
        <MentionPicker
          anchorRef={composerRootRef}
          inputRef={inputRef}
          anchorIndex={mentions.anchorIndex}
          preview={mentionsConfig?.preview !== false}
          groups={mentions.groups}
          visible={mentions.visible}
          searching={mentions.searching}
          highlighted={mentions.highlighted}
          onHighlight={mentions.setHighlighted}
          onPick={mentions.pick}
          onExpand={mentions.expandGroup}
        />
      )}
      {/* Mark-mode visuals (hint bar + hover frame + region editor) —
          portaled to the HOST page, not this iframe. */}
      {pageMarkingEnabled && (
        <PageMarkOverlay
          isActive={marking.isActive}
          draft={marking.draft}
          hover={marking.hover}
          onShapeChange={marking.setShape}
          onAttach={marking.attach}
          onDiscard={marking.dropDraft}
        />
      )}
      {/* Multi-send queue: messages waiting for their turn, docked above the
          input (Cursor-style). Renders nothing when the queue is empty. */}
      <QueuedSendsPill />
      {fileSelectionError && (
        <p role="alert" className="px-2 text-xs text-destructive">
          {fileSelectionError}
        </p>
      )}
      {dictation.error && (
        <p role="alert" className="px-2 text-xs text-destructive">
          {dictation.error === 'microphone'
            ? t('dictation_mic_blocked')
            : t('dictation_unavailable')}
        </p>
      )}
      {/* Attached context fused to the composer (Linear-style): one tray
          holds the context row and the composer card, so what the message is
          about reads as part of the thing you type into rather than as a chip
          floating above it. The tray only exists when something is attached —
          with nothing to show it collapses to the bare composer, unchanged.

          Concentric radii by calc so no frame can drift from the one outside
          it: the composer's radius is the SHELL's minus this root's padding
          (`--opencx-shell-radius` − 8px, floored at 12px so a square-cornered
          small-screen shell still gets a soft card), and the tray's is the
          composer's plus the tray padding. `ps-3` puts
          the context title on the composer's TEXT inset (4px tray + 12px =
          the composer's 8px padding + the textarea's 8px), not on its edge.

          Crucially the context lives OUTSIDE the composer's border: inside it
          the box grew on every page change, pushing the transcript up and
          moving the send button under the visitor's cursor. */}
      <div
        {...dc('chat/input_box/attached_context_tray')}
        style={
          {
            '--cx-r':
              'max(0.75rem, calc(var(--opencx-shell-radius, 2rem) - 0.5rem))',
            '--cx-p': '0.25rem',
          } as React.CSSProperties
        }
        className={cn(
          'flex flex-col',
          // The tray's BOX is permanent — only its colour changes. Toggling
          // the padding with the content made attach and detach asymmetric:
          // the 4px snapped on in one frame on the way in, and on the way out
          // it snapped OFF while the row above was still collapsing, so the
          // composer jumped before the animation had finished. A box that is
          // always there has nothing to snap; the only thing that moves is
          // the row's height, and the only thing that changes is a colour.
          'rounded-[calc(var(--cx-r)+var(--cx-p))] p-[var(--cx-p)]',
          // 200ms matches MotionDiv's FADE_TRANSITION, so the grey arrives
          // and leaves with the row rather than racing it.
          'transition-colors duration-200 ease-opencx',
          hasAttachedContext ? 'bg-muted' : 'bg-transparent',
        )}
      >
        {/* The row GROWS the tray rather than appearing at full height: an
            instant 28px row shoved the composer down a whole line in one
            frame, exactly the teleport `QueuedSendsPill` already solved a rung
            above with the same reveal. Height + opacity (the sanctioned
            accordion exception — there is no transform equivalent for a box
            that has to make room), on the shared FADE/EXIT transitions, so
            attaching and detaching mirror. */}
        <AnimatePresence>
          {hasAttachedContext && (
            <MotionDiv__VerticalReveal key="attached-context">
              <div
                {...dc('chat/input_box/page_marks_container')}
                className="flex items-center gap-1 flex-wrap ps-3 pe-1 py-1"
              >
                <AnimatePresence mode="popLayout">
                  {pageEntity && !pageEntityDismissed && (
                    <MotionDiv key="page-entity" snapExit>
                      <PageContextPill
                        entity={pageEntity}
                        onRemove={() => setPageEntityDismissed(true)}
                      />
                    </MotionDiv>
                  )}
                  {marks.map((mark, index) => (
                    <MotionDiv
                      key={`mark-${index}-${mark.note ?? ''}`}
                      snapExit
                    >
                      <PageMarkPill mark={mark} onRemove={() => detach(mark)} />
                    </MotionDiv>
                  ))}
                </AnimatePresence>
              </div>
            </MotionDiv__VerticalReveal>
          )}
        </AnimatePresence>
        <div
          {...dc('chat/input_box/inner_root')}
          className={cn(
            'transition-colors',
            'bg-background',
            // The composer sits on the same background token as the message
            // list, so without an edge it reads as part of the transcript
            // rather than as the thing you type into. That hairline is the
            // WHOLE affordance: one edge, one weight, in every state.
            //
            // No hover or focus accent. The composer takes the caret the moment
            // a panel opens, so a focus-driven edge is not feedback — it is what
            // the composer looks like at rest, a second outline competing with
            // the shell's own frame around it. `:focus-visible` does not save
            // this either: browsers match it on text-editing elements however
            // they were focused (mouse and programmatic focus included), so a
            // "keyboard-only" ring on a textarea is the same always-on ring by
            // another name. A text field already indicates focus — the caret.
            'border border-border',
            'relative rounded-[var(--cx-r)] flex flex-col gap-2 p-2',
          )}
        >
          <div
            {...dc('chat/input_box/textarea_and_attachments_container')}
            className="flex flex-col gap-2"
          >
            {allFiles.length > 0 && (
              <div
                {...dc('chat/input_box/attachments_container')}
                className="flex items-center gap-1"
              >
                <AnimatePresence mode="popLayout">
                  {allFiles.map((file) => (
                    <MotionDiv key={file.id} snapExit>
                      <UploadPreview
                        onCancel={() => handleCancelUpload(file.id)}
                        file={file}
                      />
                    </MotionDiv>
                  ))}
                </AnimatePresence>
              </div>
            )}
            {/* Picked mentions are highlighted IN the text: a mirror of the
                textarea's content sits under it, in the same box, with the
                `@Title` tokens tinted, and the textarea paints only its caret
                over that while a mention is in the draft. */}
            <div className="relative">
              {hasMentionsInDraft && (
                <div
                  ref={mirrorRef}
                  aria-hidden
                  className={cn(
                    TEXTAREA_BOX_CLASS,
                    'pointer-events-none absolute inset-0 overflow-hidden',
                    'whitespace-pre-wrap break-words text-foreground',
                    allFiles.length === 0 && 'pt-1',
                    isSmallScreen ? 'text-[16px]' : 'text-sm',
                  )}
                >
                  <MentionText
                    text={inputText}
                    mentions={mentions.picked}
                    tokenClassName="bg-primary/10 text-primary"
                  />
                </div>
              )}
              <textarea
                {...dc('chat/input_box/textarea')}
                onPaste={handlePaste}
                ref={inputRef}
                id="chat-input"
                value={inputText}
                // Thw `rows` attribute will take effect in browsers that do not support [field-sizing:content;] (Firefox and Safari as of now)
                rows={3}
                className={cn(
                  /** Match the border radius of the container */
                  // INPUT_CONTAINER_B_RADIUS,
                  TEXTAREA_BOX_CLASS,
                  'relative resize-none',
                  allFiles.length === 0 && 'pt-1',
                  'bg-transparent outline-none',
                  'placeholder:text-muted-foreground',
                  hasMentionsInDraft && 'text-transparent caret-foreground',
                  // 16px on mobiles prevents auto-zoom on the input when focused
                  isSmallScreen ? 'text-[16px]' : 'text-sm',
                )}
                onScroll={(e) => {
                  if (mirrorRef.current)
                    mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
                }}
                onChange={(e) => {
                  recall.onEdit();
                  setInputText(e.target.value);
                }}
                onClick={() => mentions.onCaretMove('nearest')}
                onKeyUp={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
                    mentions.onCaretMove('forward');
                  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
                    mentions.onCaretMove('backward');
                  else if (event.key === 'Home' || event.key === 'End')
                    mentions.onCaretMove('nearest');
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  // An open mention picker owns ↑/↓/Enter/Tab/Escape.
                  if (mentions.onKeyDown(event)) return;
                  // Mod+Enter sends too — muscle memory from every other
                  // composer; plain Shift+Enter stays a newline.
                  if (
                    matchesBinding(event, WIDGET_KEYBINDINGS.send) ||
                    matchesBinding(event, WIDGET_KEYBINDINGS['send-alt'])
                  ) {
                    event.preventDefault();
                    if (flushQueueOnEnter) stop();
                    else handleSubmit();
                    return;
                  }
                  // Mark-mode's own Esc listener lives on the HOST document;
                  // keystrokes inside the chat iframe never reach it.
                  if (event.key === 'Escape' && marking.isActive) {
                    marking.disarm();
                    return;
                  }
                  recall.onKeyDown(event);
                }}
                placeholder={placeholder ?? t('write_a_message_placeholder')}
              />
            </div>
          </div>
          <div className="gap-2 flex justify-between">
            {/* Left group: composer inputs (attach + page marks). Hidden
              entirely on the docked quick-ask bar (history-only there). */}
            <div className="flex items-center gap-1">
              {!hideAttachTools && (
                <>
                  {canAttach && (
                    <Tooltippy
                      side="top"
                      align="start"
                      disabled={disableTooltips}
                      content={t('attach_files')}
                    >
                      <Button
                        onClick={dropzone__openFileSelect}
                        aria-label={t('attach_files')}
                        size="fit"
                        variant="ghost"
                        className={cn(
                          'rounded-full size-8 flex items-center justify-center p-0 overflow-hidden',
                        )}
                      >
                        <AnimatePresence mode="wait">
                          {!shouldBlockSending ? (
                            <MotionDiv key="paper-clip" distance={0}>
                              <PaperclipIcon className="size-4" />
                            </MotionDiv>
                          ) : (
                            <MotionDiv key="paper-clip-disabled" distance={0}>
                              <PaperclipIcon className="size-4 opacity-50" />
                            </MotionDiv>
                          )}
                        </AnimatePresence>
                      </Button>
                    </Tooltippy>
                  )}

                  {dictation.enabled && (
                    <DictationMicButton
                      status={dictation.status}
                      levelRef={dictation.levelRef}
                      onToggle={dictation.toggle}
                      onPrewarm={dictation.prewarm}
                      disableTooltip={disableTooltips}
                    />
                  )}

                  {showPageMarks && (
                    <Tooltippy
                      side="top"
                      align="start"
                      disabled={disableTooltips}
                      content={
                        marking.isActive
                          ? t('mark_page_active')
                          : t('mark_page')
                      }
                    >
                      <Button
                        {...dc('chat/input_box/page_mark_btn')}
                        onClick={marking.toggle}
                        aria-label={
                          marking.isActive
                            ? t('mark_page_active')
                            : t('mark_page')
                        }
                        size="fit"
                        variant="ghost"
                        className={cn(
                          'rounded-full size-8 flex items-center justify-center p-0 overflow-hidden',
                          'transition-transform active:scale-95',
                          // Armed: filled like the send button so the mode is
                          // unmistakable; click again (or Esc) to disarm.
                          marking.isActive &&
                            'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
                        )}
                      >
                        <MousePointerClickIcon className="size-4" />
                      </Button>
                    </Tooltippy>
                  )}
                </>
              )}
            </div>

            {/* Right group: extra controls (e.g. quick-ask history) + send. */}
            <div className="flex items-center gap-1">
              {trailingActions}

              <Tooltippy
                // While streaming: typing a new message queues it (send); an empty
                // box stops the current response — the next queued message (if
                // any) then starts its own turn immediately.
                content={showStop ? t('stop_response') : t('send_message')}
                shortcut={
                  showStop ? undefined : formatBinding(WIDGET_KEYBINDINGS.send)
                }
                side="top"
                align="end"
                disabled={disableTooltips}
              >
                <Button
                  size="fit"
                  onClick={showStop ? stop : handleSubmit}
                  aria-label={showStop ? t('stop_response') : t('send_message')}
                  // Stop is always available; sending obeys `sendDisabled`.
                  disabled={!showStop && sendDisabled}
                  className="rounded-full size-8 flex items-center justify-center p-0"
                >
                  <AnimatePresence mode="wait">
                    {showStop ? (
                      <MotionDiv key="stop" snapExit distance={0}>
                        <SquareIcon className="size-3 fill-current" />
                      </MotionDiv>
                    ) : !isStreaming && (shouldBlockSending || isUploading) ? (
                      <MotionDiv key="loading" snapExit distance={0}>
                        <CircleDashed className="size-4 animate-spin animate-iteration-infinite" />
                      </MotionDiv>
                    ) : (
                      <MotionDiv key="send" snapExit distance={0}>
                        <ArrowUpIcon className="size-4" />
                      </MotionDiv>
                    )}
                  </AnimatePresence>
                </Button>
              </Tooltippy>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * What the visitor wrote on their marks, as the message text for a send that
 * carries no typed message. One note per line, in the order they were
 * attached; null when nobody wrote anything.
 */
/** How long a send waits for a mark's snapshot upload still in flight. */
const SNAPSHOT_UPLOAD_GRACE_MS = 1500;

function markNotes(marks: PageMark[]): string | null {
  const notes = marks.flatMap((mark) => {
    const note = mark.note?.trim();
    return note ? [note] : [];
  });
  return notes.length > 0 ? notes.join('\n') : null;
}
