import {
  useConfig,
  useCsat,
  useMessages,
  useSessions,
  useWidget,
  useWidgetRouter,
} from '@opencx/widget-react-headless';
import { AnimatePresence } from 'framer-motion';
import { CircleCheckIcon } from 'lucide-react';
import React from 'react';
import { CsatSurvey } from '../../components/CsatSurvey';
import { MightSolveUserIssueSuggestedReplies } from '../../components/MightSolveUserIssueSuggestedReplies';
import { SuggestedReplyButton } from '../../components/SuggestedReplyButton';
import { MotionDiv__VerticalReveal } from '../../components/lib/MotionDiv__VerticalReveal';
import { Button } from '../../components/lib/button';
import { useTranslation } from '../../hooks/useTranslation';
import { ChatFooterItems } from './ChatFooterItems';
import { ChatInput } from './ChatInput';

export { ChatInput } from './ChatInput';

function NewConvOrBackToConvsButton() {
  const { widgetCtx } = useWidget();
  const { router } = useConfig();
  const { canCreateNewSession } = useSessions();
  const { toSessionsScreen } = useWidgetRouter();
  const { t } = useTranslation();

  return (
    <>
      {canCreateNewSession || !!router?.chatScreenOnly ? (
        <Button onClick={widgetCtx.resetChat} className="rounded-2xl w-full">
          {t('new_conversation')}
        </Button>
      ) : (
        <Button onClick={toSessionsScreen} className="rounded-2xl w-full">
          {t('back_to_conversations')}
        </Button>
      )}
    </>
  );
}

function SessionClosedSection() {
  const { t } = useTranslation();
  const { isCsatRequested, isCsatSubmitted } = useCsat();

  return (
    <div className="p-2">
      <div className="p-2 bg-muted rounded-3xl">
        <AnimatePresence mode="wait">
          {isCsatRequested || isCsatSubmitted ? (
            <MotionDiv__VerticalReveal key="csat">
              <CsatSurvey />
              <AnimatePresence mode="wait">
                {isCsatSubmitted && (
                  <MotionDiv__VerticalReveal key="new-conv-or-back-to-convs-button">
                    <NewConvOrBackToConvsButton />
                  </MotionDiv__VerticalReveal>
                )}
              </AnimatePresence>
            </MotionDiv__VerticalReveal>
          ) : (
            <MotionDiv__VerticalReveal key="session-closed">
              <div className="ps-2 flex items-center gap-1 pb-2">
                <CircleCheckIcon className="size-4 text-emerald-600" />
                <h2 className="text-sm font-medium">
                  {t('your_issue_has_been_resolved')}
                </h2>
              </div>
              <NewConvOrBackToConvsButton />
            </MotionDiv__VerticalReveal>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function ChatFooter() {
  const { initialQuestions, initialQuestionsPosition, thisWasHelpfulOrNot } =
    useConfig();
  const { sessionState } = useSessions();
  const { messagesState } = useMessages();

  const noMessages = messagesState.messages.length === 0;

  return (
    <footer>
      <AnimatePresence mode="wait">
        {sessionState.session && !sessionState.session?.isOpened ? (
          <MotionDiv__VerticalReveal key="session-closed">
            <SessionClosedSection />
            <ChatFooterItems />
          </MotionDiv__VerticalReveal>
        ) : (
          <MotionDiv__VerticalReveal key="chat-input">
            {messagesState.lastAIResMightSolveUserIssue &&
              thisWasHelpfulOrNot?.enabled !== false && (
                <MightSolveUserIssueSuggestedReplies />
              )}

            {noMessages &&
              initialQuestions &&
              initialQuestionsPosition !== 'below-initial-messages' && (
                <div className="flex items-center flex-row justify-end gap-2 flex-wrap px-2">
                  {initialQuestions?.map((iq, index) => (
                    <SuggestedReplyButton
                      key={`${iq}-${index}`}
                      suggestion={iq}
                    />
                  ))}
                </div>
              )}

            <ChatInput />
            <ChatFooterItems />
          </MotionDiv__VerticalReveal>
        )}
      </AnimatePresence>
    </footer>
  );
}
