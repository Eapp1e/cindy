import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getDataOwnerGeneration, isDataOwnerGenerationCurrent } from '@/contexts/dataOwnerGeneration';
import type { BotGroupMemberView, BotGroupPendingExecution } from '../../../shared/botGroupChat';

/** Durable queued/interrupted work belongs in recovery, never in a live typing indicator. */
export function BotGroupPendingReplies({ groupId, executions, members, onChanged }: {
  groupId: string;
  executions: readonly BotGroupPendingExecution[];
  members: readonly BotGroupMemberView[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  if (!executions.length) return null;
  const control = async (executionId: string, action: 'stop' | 'retry') => {
    if (pending) return;
    const owner = getDataOwnerGeneration();
    setPending(executionId);
    setFailed(false);
    try {
      const api = window.electronAPI?.maker?.chatServer;
      const result = await api?.manage({ groupId, action: { type: 'execution', executionId, action } });
      if (!alive.current || !isDataOwnerGenerationCurrent(owner)) return;
      if (result?.ok) onChanged();
      else setFailed(true);
    } catch {
      if (alive.current && isDataOwnerGenerationCurrent(owner)) setFailed(true);
    } finally {
      if (alive.current && isDataOwnerGenerationCurrent(owner)) setPending(null);
    }
  };
  return (
    <details className="mx-auto w-full max-w-[760px] px-2 py-2 text-12 text-[var(--text-secondary)]" data-testid="bot-group-pending-replies">
      <summary className="cursor-pointer py-1">{t('bots.groupChat.pendingReplies.title', { count: executions.length })}</summary>
      <ul className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto">
        {executions.map(execution => (
          <li key={execution.executionId} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 flex-1 break-words">
              {members.find(member => member.botId === execution.botId)?.name ?? t('bots.groupChat.pendingReplies.companion')}
              {' · '}{t(`bots.groupChat.pendingReplies.${execution.status}`)}
            </span>
            {execution.canRetry ? <Button type="button" variant="secondary" tone="quiet" size="sm" compact
              disabled={pending !== null} onClick={() => void control(execution.executionId, 'retry')}>
              {t('bots.groupChat.pendingReplies.retry')}
            </Button> : null}
            {execution.canStop ? <Button type="button" variant="secondary" tone="quiet" size="sm" compact
              disabled={pending !== null} onClick={() => void control(execution.executionId, 'stop')}>
              {t('bots.groupChat.pendingReplies.stop')}
            </Button> : null}
          </li>
        ))}
      </ul>
      {failed ? <p role="alert" className="mt-1 text-[var(--text-danger)]">{t('bots.groupChat.pendingReplies.failed')}</p> : null}
    </details>
  );
}
