import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Input } from '../../components/input';
import { Skeleton } from '../../components/skeleton';
import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { queryKeys } from '../../lib/query-keys';

import { fetchMe, setPassword } from './api/auth-api';
import { passwordSchema, type PasswordValues } from './auth-schemas';

/**
 * Sets a password for email sign-in, or changes it. An account from Google, or one whose password
 * was cleared when Google was linked to it, has none and sets one without the current password.
 */
export function PasswordCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useQuery({ queryKey: queryKeys.me, queryFn: fetchMe });
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const save = useMutation({
    mutationFn: (values: PasswordValues) =>
      setPassword({
        newPassword: values.newPassword,
        ...(me.data?.hasPassword === true ? { currentPassword: values.currentPassword } : {}),
      }),
    onSuccess: () => {
      toast.push('Password saved', 'ok');
      form.reset();
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });

  if (me.isPending) {
    return <Skeleton className="h-40 max-w-lg" />;
  }
  if (me.isError) {
    return null;
  }
  const hasPassword = me.data.hasPassword;
  return (
    <Card className="max-w-lg">
      <h2 className="mb-1 font-semibold">{hasPassword ? 'Change password' : 'Set a password'}</h2>
      {hasPassword ? null : (
        <p className="mb-3 text-sm text-muted">
          You sign in with Google. Set a password to sign in with your email as well.
        </p>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          void form.handleSubmit((values) => {
            save.mutate(values);
          })(event);
        }}
        noValidate
      >
        {hasPassword ? (
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            error={form.formState.errors.currentPassword?.message}
            {...form.register('currentPassword')}
          />
        ) : null}
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.newPassword?.message}
          {...form.register('newPassword')}
        />
        {save.isError ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(save.error)}
          </p>
        ) : null}
        <Button type="submit" loading={save.isPending} className="self-start">
          Save password
        </Button>
      </form>
    </Card>
  );
}
