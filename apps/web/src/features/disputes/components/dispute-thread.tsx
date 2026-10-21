import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '../../../components/button';
import { cn } from '../../../components/cn';
import { StatusBadge } from '../../../components/status-badge';
import { Textarea } from '../../../components/textarea';
import { formatDateTime } from '../../../lib/format';
import type { DisputeDetails } from '../disputes-api';

const messageSchema = z.object({ text: z.string().trim().min(1, 'Write a message').max(2000) });
type MessageValues = z.infer<typeof messageSchema>;

const ROLE_LABEL = { CUSTOMER: 'Buyer', SELLER: 'Seller', ADMIN: 'Moderator' } as const;

interface DisputeThreadProps {
  dispute: DisputeDetails;
  currentUserId: string;
  sending: boolean;
  error?: string | null;
  onSend: (text: string) => void;
}

export function DisputeThread({
  dispute,
  currentUserId,
  sending,
  error = null,
  onSend,
}: DisputeThreadProps) {
  const form = useForm<MessageValues>({
    resolver: zodResolver(messageSchema),
    defaultValues: { text: '' },
  });
  const resolved = dispute.status.startsWith('RESOLVED');

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Dispute</h2>
          <StatusBadge status={dispute.status} />
        </div>
        <p className="text-sm">{dispute.reason}</p>
        {dispute.resolutionNote ? (
          <p className="rounded-md bg-slate-100 p-2 text-sm">
            Resolution: {dispute.resolutionNote}
          </p>
        ) : null}
      </div>

      <ul className="space-y-2" aria-label="Messages">
        {dispute.messages.length === 0 ? (
          <li className="text-sm text-muted">No messages yet.</li>
        ) : null}
        {dispute.messages.map((message) => {
          const own = message.authorId === currentUserId;
          return (
            <li
              key={message.id}
              className={cn(
                'max-w-[85%] rounded-lg p-2 text-sm',
                own ? 'ml-auto bg-blue-50' : 'bg-slate-100',
              )}
            >
              <p className="mb-0.5 text-xs text-muted">
                {own ? 'You' : ROLE_LABEL[message.authorRole]} · {formatDateTime(message.createdAt)}
              </p>
              <p className="whitespace-pre-line">{message.text}</p>
            </li>
          );
        })}
      </ul>

      {resolved ? (
        <p className="text-sm text-muted">This dispute is closed.</p>
      ) : (
        <form
          className="space-y-2"
          noValidate
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              onSend(values.text);
              form.reset();
            })(event);
          }}
        >
          <Textarea
            id="dispute-message"
            label="Message"
            error={form.formState.errors.text?.message}
            rows={3}
            {...form.register('text')}
          />
          {error !== null ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={sending}>
            Send
          </Button>
        </form>
      )}
    </div>
  );
}
