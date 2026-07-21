import { vi } from 'vitest';
import type { ApiCaller } from '../api/api-caller';
import { genUuid } from '../utils/uuid';

export const TestUtils = {
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  mock: {
    ApiCaller: {
      createSession(target, returnValue) {
        target.prototype.createSession = vi
          .fn(target.prototype.createSession)
          .mockResolvedValue({
            response: new Response(),
            data: {
              id: genUuid(),
              ticketNumber: 1,
              title: null,
              assignee: { kind: 'ai', name: null, avatarUrl: null },
              channel: '',
              createdAt: new Date().toISOString(),
              isHandedOff: false,
              isOpened: true,
              isVerified: false,
              lastMessage: '',
              updatedAt: new Date().toISOString(),
              latestStateCheckpointPayload: null,
              modeId: null,
              sessionAttributes: {},
              ...returnValue?.data,
            },
          });
      },
      createUnverifiedContact(target, returnValue) {
        target.prototype.createUnverifiedContact = vi
          .fn(target.prototype.createUnverifiedContact)
          .mockResolvedValue({
            response: new Response(),
            data: {
              token: 'some-token',
              ...returnValue?.data,
            },
          });
      },
      getSessions(target, returnValue) {
        target.prototype.getSessions = vi
          .fn(target.prototype.getSessions)
          .mockResolvedValue({
            response: new Response(),
            data: { items: [], next: null, ...returnValue?.data },
          });
      },
      sendMessage(target, returnValue) {
        target.prototype.sendMessage = vi
          .fn(target.prototype.sendMessage)
          .mockResolvedValue({
            response: new Response(),
            data:
              returnValue?.data?.success === false
                ? {
                    success: false,
                    error: {
                      code: 'some-code',
                      message: 'some-message',
                      ...returnValue?.data?.error,
                    },
                  }
                : {
                    success: true,
                    autopilotResponse: {
                      type: 'text',
                      value: {
                        error: false,
                        content: 'some-reply',
                      },
                      id: genUuid(),
                      mightSolveUserIssue: false,
                      completelyAndFullyCoveredUserIssue: false,
                    },
                    ...returnValue?.data,
                  },
          });
      },
      setAuthToken(target, _returnValue) {
        target.prototype.setAuthToken = vi.fn();
      },
      getStreamTransportOptions(target, _returnValue) {
        target.prototype.getStreamTransportOptions = vi
          .fn(target.prototype.getStreamTransportOptions)
          .mockReturnValue({
            api: 'http://localhost:8080/backend/widget/v5/chat/stream',
            reconnectApi: (sessionId: string) =>
              `http://localhost:8080/backend/widget/v5/chat/${sessionId}/stream`,
            headers: {},
          });
      },
      stopStream(target, _returnValue) {
        target.prototype.stopStream = vi
          .fn(target.prototype.stopStream)
          .mockResolvedValue(undefined);
      },
      uploadFile(target, _returnValue) {
        target.prototype.uploadFile = vi
          .fn(target.prototype.uploadFile)
          .mockResolvedValue({
            fileName: 'some-file-name',
            fileUrl: 'some-file-url',
          });
      },
      vote(target, returnValue) {
        target.prototype.vote = vi.fn(target.prototype.vote).mockResolvedValue({
          response: new Response(),
          data: {
            messagePublicId: genUuid(),
            success: true,
            ...returnValue?.data,
          },
        });
      },
      getExternalWidgetConfig(target, returnValue) {
        target.prototype.getExternalWidgetConfig = vi
          .fn(target.prototype.getExternalWidgetConfig)
          .mockResolvedValue({
            response: new Response(),
            data: {
              org: {
                id: genUuid(),
                name: 'some-org-name',
              },
              sessionsPollingIntervalSeconds: 60,
              sessionPollingIntervalSeconds: 10,
              modes: [],
              ...returnValue?.data,
            },
          });
      },
      pollSessionAndHistory(target, returnValue) {
        target.prototype.pollSessionAndHistory = vi
          .fn(target.prototype.pollSessionAndHistory)
          .mockResolvedValue({
            response: new Response(),
            data: {
              session: {
                id: genUuid(),
                ticketNumber: 1,
                title: null,
                assignee: { kind: 'ai', name: null, avatarUrl: null },
                channel: '',
                createdAt: new Date().toISOString(),
                isHandedOff: false,
                isOpened: true,
                isVerified: false,
                lastMessage: '',
                updatedAt: new Date().toISOString(),
                modeId: null,
                latestStateCheckpointPayload: null,
                sessionAttributes: {},
                ...returnValue?.data?.session,
              },
              history: [...(returnValue?.data?.history || [])],
            },
          });
      },
      resolveSession(target, returnValue) {
        target.prototype.resolveSession = vi
          .fn(target.prototype.resolveSession)
          .mockResolvedValue({
            response: new Response(),
            data: {
              id: genUuid(),
              ticketNumber: 1,
              title: null,
              assignee: { kind: 'ai', name: null, avatarUrl: null },
              channel: '',
              createdAt: new Date().toISOString(),
              isHandedOff: false,
              isOpened: false,
              isVerified: false,
              lastMessage: '',
              updatedAt: new Date().toISOString(),
              modeId: null,
              latestStateCheckpointPayload: null,
              sessionAttributes: {},
              ...returnValue?.data,
            },
          });
      },
      createStateCheckpoint(target, returnValue) {
        target.prototype.createStateCheckpoint = vi
          .fn(target.prototype.createStateCheckpoint)
          .mockResolvedValue({
            response: new Response(),
            data: {
              success: true,
              ...returnValue?.data,
            },
          });
      },
      submitCsat(target, returnValue) {
        target.prototype.submitCsat = vi
          .fn(target.prototype.submitCsat)
          .mockResolvedValue({
            response: new Response(),
            data: {
              success: true,
              ...returnValue?.data,
            },
          });
      },
    } satisfies {
      [K in keyof ApiCaller]: (
        target: typeof ApiCaller,
        returnValue?: Partial<Awaited<ReturnType<ApiCaller[K]>>>,
      ) => void;
    },
  },
};
