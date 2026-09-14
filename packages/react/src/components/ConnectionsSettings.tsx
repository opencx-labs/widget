import React, { useEffect, useState } from 'react';
import { useWidget } from '@opencx/widget-react-headless';
import type { ApprovalPreference } from '@opencx/widget-core';
import { ArrowLeft, ChevronRight, Unplug } from 'lucide-react';
import { Button } from './lib/button';
import { Header } from './Header';
import { McpIcon } from './lib/McpIcon';

type Connection = Awaited<
  ReturnType<
    ReturnType<typeof useWidget>['widgetCtx']['api']['listConnections']
  >
>[number];

export function ConnectionsSettings({
  children,
}: {
  children: React.ReactNode;
}) {
  const { widgetCtx, config } = useWidget();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [rules, setRules] = useState<ApprovalPreference[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (config.capabilities?.connections === false) return;
    void Promise.all([
      widgetCtx.api.listConnections(),
      widgetCtx.api.listApprovalPreferences(),
    ])
      .then(([items, permissions]) => {
        if (cancelled) return;
        setConnections(items.filter((item) => item.status !== 'not_connected'));
        setRules(permissions);
      })
      .catch(() => {
        /* Unauthenticated visitors have no personal connections. */
      });
    return () => {
      cancelled = true;
    };
  }, [widgetCtx, config.capabilities?.connections]);
  const change = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch {
      setError('Could not save the change. Try again.');
    } finally {
      setBusy(false);
    }
  };
  if (!open)
    return (
      <>
        <Header />
        {connections.length > 0 && (
          <Button
            variant="ghost"
            className="mx-3 my-1 h-9 justify-start gap-2 text-sm"
            onClick={() => setOpen(true)}
          >
            <Unplug className="size-4" /> Connections{' '}
            <ChevronRight className="ml-auto size-4" />
          </Button>
        )}
        {children}
      </>
    );
  return (
    <section
      className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-5"
      aria-label="Connections"
    >
      <div className="flex h-8 items-center gap-2 pr-16">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={selectedId ? 'Back to connections' : 'Back to sessions'}
          onClick={() => (selectedId ? setSelectedId(null) : setOpen(false))}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="text-sm font-medium">Connections</h2>
      </div>
      {!connections.length && (
        <p className="text-sm text-muted-foreground">No connected services.</p>
      )}
      {!selectedId && (
        <>
          <input
            type="search"
            aria-label="Search connections"
            placeholder="Search connections"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-full rounded-full border border-foreground/15 bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="space-y-1">
            <h3 className="border-b border-foreground/10 pb-2 text-xs font-medium">
              Connected services
            </h3>
            {connections
              .filter((item) =>
                item.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((item) => (
                <button
                  key={item.server_id}
                  type="button"
                  onClick={() => setSelectedId(item.server_id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-background p-2">
                    <McpIcon />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {item.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.status === 'connected'
                        ? 'Connected'
                        : 'Reconnect required'}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              ))}
            {connections.length > 0 &&
              !connections.some((item) =>
                item.name.toLowerCase().includes(search.toLowerCase()),
              ) && (
                <p className="py-3 text-xs text-muted-foreground">
                  No matching connections.
                </p>
              )}
          </div>
        </>
      )}
      {connections
        .filter((connection) => connection.server_id === selectedId)
        .map((connection) => (
          <div
            key={connection.server_id}
            className="border-b border-foreground/10 pb-5 space-y-3 last:border-0"
          >
            <div className="flex size-12 items-center justify-center rounded-xl border border-foreground/10 bg-background p-3">
              <McpIcon />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{connection.name}</p>
                <p className="text-xs text-muted-foreground">
                  {connection.status === 'connected'
                    ? 'Connected'
                    : 'Reconnect required'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={busy}
                onClick={() =>
                  void change(async () => {
                    await widgetCtx.api.disconnectConnection(
                      connection.server_id,
                    );
                    setSelectedId(null);
                    setConnections((items) =>
                      items.filter(
                        (item) => item.server_id !== connection.server_id,
                      ),
                    );
                    setRules((items) =>
                      items.filter(
                        (item) => item.serverId !== connection.server_id,
                      ),
                    );
                  })
                }
              >
                Disconnect
              </Button>
            </div>
            {rules.some((rule) => rule.serverId === connection.server_id) ? (
              <div className="space-y-2">
                <h3 className="text-xs font-medium">
                  Saved approvals (
                  {
                    rules.filter(
                      (rule) => rule.serverId === connection.server_id,
                    ).length
                  }
                  )
                </h3>
                <p className="text-xs text-muted-foreground">
                  Removing an approval makes the widget ask again next time.
                </p>
                <ul
                  className="max-h-64 overflow-y-auto divide-y divide-foreground/10 rounded-xl border border-foreground/10"
                  aria-label={`${connection.name} saved approvals`}
                >
                  {rules
                    .filter((rule) => rule.serverId === connection.server_id)
                    .map((rule) => (
                      <li key={rule.key} className="flex items-start gap-3 p-3">
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-xs font-medium break-words">
                            {rule.toolName.replace(/[_-]+/g, ' ')}
                          </p>
                          <p className="text-xs text-muted-foreground break-words">
                            {rule.message}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-xs"
                          disabled={busy}
                          onClick={() =>
                            void change(async () => {
                              await widgetCtx.api.revokeApprovalPreference(
                                rule.serverId,
                                rule.key,
                              );
                              setRules((items) =>
                                items.filter(
                                  (item) =>
                                    item.serverId !== rule.serverId ||
                                    item.key !== rule.key,
                                ),
                              );
                            })
                          }
                        >
                          Remove approval
                        </Button>
                      </li>
                    ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No saved approvals
              </p>
            )}
          </div>
        ))}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
