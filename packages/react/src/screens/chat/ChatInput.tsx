import { type SendMessageDto } from '@opencx/widget-core';
import {
  useAgentChatUi,
  useConfig,
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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { MotionDiv } from '../../components/lib/MotionDiv';
import { Button } from '../../components/lib/button';
import { Tooltippy } from '../../components/lib/tooltip';
import { cn } from '../../components/lib/utils/cn';
import { useIsSmallScreen } from '../../hooks/useIsSmallScreen';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../hooks/useTranslation';
import { PageMarkOverlay } from '../../page-marks/PageMarkOverlay';
import { PageMarkPill } from '../../page-marks/PageMarkPill';
import { usePageMarks } from '../../page-marks/PageMarksProvider';
import { resolvePageMarkTheme } from '../../page-marks/page-mark-theme';
import { usePageMarking } from '../../page-marks/usePageMarks';
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
import { useSentTextRecall } from './useSentTextRecall';

/**
 * The stock composer — white card, multi-line textarea, attach + send.
 * Exported so companion's quick-ask state renders the exact same composer
 * (not a bespoke bar), inheriting every customization automatically.
 * `onMessageSent` fires once a message is accepted, letting the
 * companion shell morph from the quick-ask card into the full chat panel.
 */
export function ChatInput({
  onMessageSent,
  trailingActions,
  disableTooltips,
  placeholder,
  hideAttachTools,
}: {
  onMessageSent?: () => void;
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
  const mountedRef = useRef(true);
  const { sendMessage, rememberSentText, getSentTextHistory } = useMessages();
  const { widgetCtx } = useWidget();
  // Agent-chat streaming state — no-op defaults for bot-chat embeds.
  const { isStreaming, onStop } = useAgentChatUi();
  const { sessionState } = useSessions();
  const { disableSendingWhenAwaitingAIReply, enablePageMarks } = useConfig();
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [fileSelectionError, setFileSelectionError] = useState<string | null>(
    null,
  );

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

  // THE page-marking tool: hover an element, click to land an editable box
  // mark (move / resize / reshape / note), attach it as context. Attached
  // marks live in a store OUTSIDE this component — collapsing the panel
  // unmounts the composer, and component state would take the pills and every
  // mark on the page down with it. The Widget-scoped provider stays mounted.
  const { theme, cssVars } = useTheme();
  const pageMarkTheme = resolvePageMarkTheme({
    cssVars,
    primaryColor: theme.primaryColor,
    contentZIndex: theme.widgetContentContainer.zIndex,
  });
  const showPageMarks = !!enablePageMarks && !isSmallScreen;
  const pageMarkingEnabled = showPageMarks && hideAttachTools !== true;
  const { marks, detach } = usePageMarks();
  const onMarkAttached = useCallback(() => {
    // Bring the visitor back to their question after the mark lands.
    inputRef.current?.focus();
  }, []);
  const marking = usePageMarking({
    enabled: pageMarkingEnabled,
    onAttach: onMarkAttached,
    accentColor: pageMarkTheme.accent,
    zIndex: pageMarkTheme.inkZIndex,
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
  // One public option controls both reply engines. Agent chat can queue while
  // streaming only when the embedder explicitly opts out of the default gate.
  const shouldBlockSending =
    disableSendingWhenAwaitingAIReply !== false &&
    (widgetCtx.isAgentBound ? isStreaming : isAwaitingBotReply);

  const handleFileDrop = (acceptedFiles: File[]) => {
    setFileSelectionError(null);
    appendFiles(acceptedFiles);
  };

  const cannotSend = !inputText.trim() && successFiles.length === 0;

  // The send button's single decision: an empty box mid-stream offers stop;
  // otherwise the button sends, subject to uploads and the configured
  // awaiting-reply gate.
  const showStop = isStreaming && (cannotSend || shouldBlockSending);
  const sendDisabled = isUploading || shouldBlockSending || cannotSend;

  const handleSubmit = () => {
    if (shouldBlockSending) return;
    if (cannotSend) return;

    // Sending now would silently drop files still uploading (only
    // `successFiles` ride the payload).
    if (isUploading) return;
    const submittedText = inputText;
    const trimmed = inputText.trim();
    const submittedFiles = [...successFiles];
    const submittedFileIds = allFiles.map((file) => file.id);
    const submittedMarks = [...marks];
    let didAccept = false;

    // Do not await this
    void sendMessage({
      content: trimmed,
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
      // Page marks ride as AI-visible context, not message text.
      clientContext:
        submittedMarks.length > 0 ? { page_marks: submittedMarks } : undefined,
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
        setInputText((current) => (current === submittedText ? '' : current));
        // May morph/unmount the companion composer; keep it strictly last.
        onMessageSent?.();
      },
    }).catch((error: unknown) => {
      console.error('[opencx] failed to send message', error);
    });
  };

  const {
    getRootProps: dropzone__getRootProps,
    getInputProps: dropzone__getInputProps,
    open: dropzone__openFileSelect,
  } = useDropzone({
    onDrop: handleFileDrop,
    noClick: true,
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

  return (
    <div
      {...dc('chat/input_box/root')}
      className="p-2 relative space-y-1"
      {...dropzone__getRootProps()}
    >
      <input {...dropzone__getInputProps()} />
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
      <div
        {...dc('chat/input_box/inner_root')}
        className={cn(
          'transition-colors',
          'bg-background',
          'relative rounded-3xl flex flex-col gap-2 p-2',
          'hover:border-primary focus-within:border-primary',
        )}
      >
        <div
          {...dc('chat/input_box/textarea_and_attachments_container')}
          className="flex flex-col gap-2"
        >
          {marks.length > 0 && (
            <div
              {...dc('chat/input_box/page_marks_container')}
              className="flex items-center gap-1 flex-wrap"
            >
              <AnimatePresence mode="popLayout">
                {marks.map((mark, index) => (
                  <MotionDiv key={`mark-${index}-${mark.note ?? ''}`} snapExit>
                    <PageMarkPill mark={mark} onRemove={() => detach(mark)} />
                  </MotionDiv>
                ))}
              </AnimatePresence>
            </div>
          )}
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
              'max-h-16 [field-sizing:content]',
              'w-full resize-none px-2',
              allFiles.length === 0 && 'pt-1',
              'bg-transparent outline-none',
              'placeholder:text-muted-foreground',
              // 16px on mobiles prevents auto-zoom on the input when focused
              isSmallScreen ? 'text-[16px]' : 'text-sm',
            )}
            onChange={(e) => {
              recall.onEdit();
              setInputText(e.target.value);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              // Mod+Enter sends too — muscle memory from every other
              // composer; plain Shift+Enter stays a newline.
              if (
                matchesBinding(event, WIDGET_KEYBINDINGS.send) ||
                matchesBinding(event, WIDGET_KEYBINDINGS['send-alt'])
              ) {
                event.preventDefault();
                handleSubmit();
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
        <div className="gap-2 flex justify-between">
          {/* Left group: composer inputs (attach + page marks). Hidden
              entirely on the docked quick-ask bar (history-only there). */}
          <div className="flex items-center gap-1">
            {!hideAttachTools && (
              <>
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

                {showPageMarks && (
                  <Tooltippy
                    side="top"
                    align="start"
                    disabled={disableTooltips}
                    content={
                      marking.isActive ? t('mark_page_active') : t('mark_page')
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
                onClick={showStop ? onStop : handleSubmit}
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
  );
}
