import type { WidgetMessageU } from '@opencx/widget-core';
import { useBot, useConfig } from '@opencx/widget-react-headless';
import React from 'react';
import { AgentMessageGroup } from '../../components/AgentMessageGroup';
import { UserMessageGroup } from '../../components/UserMessageGroup';
import {
  isAgentMessageGroup,
  isBotMessageGroup,
  isUserMessageGroup,
} from '../../utils/group-messages-by-type';

/**
 * Renders grouped transcript messages — the rule shared by the bot-chat and
 * agent-chat lists. Bot (AI) groups carry the configured bot identity
 * (server-resolved agent branding wins); human-agent groups prefer the
 * server-provided sender, patched by the `humanAgent` config override.
 */
export function MessageGroups({ groups }: { groups: WidgetMessageU[][] }) {
  const { humanAgent } = useConfig();
  const bot = useBot();

  return (
    <>
      {groups.map((group) => {
        const firstIdInGroup = group[0]?.id;
        if (!firstIdInGroup) return null;

        if (isUserMessageGroup(group)) {
          return <UserMessageGroup key={firstIdInGroup} messages={group} />;
        }

        if (isBotMessageGroup(group)) {
          return (
            <AgentMessageGroup
              key={firstIdInGroup}
              messages={group}
              agent={bot ? { ...bot, isAi: true, id: null } : undefined}
            />
          );
        }

        if (isAgentMessageGroup(group)) {
          const agent = group[0]?.agent;
          return (
            <AgentMessageGroup
              key={firstIdInGroup}
              messages={group}
              agent={
                agent
                  ? {
                      ...agent,
                      name: humanAgent?.name || agent.name || '',
                      avatarUrl:
                        humanAgent?.avatarUrl || agent.avatarUrl || null,
                    }
                  : humanAgent
                    ? {
                        isAi: false,
                        id: null,
                        name: humanAgent.name || '',
                        avatarUrl: humanAgent.avatarUrl || null,
                      }
                    : undefined
              }
            />
          );
        }

        return null;
      })}
    </>
  );
}
