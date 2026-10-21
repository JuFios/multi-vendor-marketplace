import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Input } from '../../components/input';
import { register } from '../../features/auth/api/auth-api';
import { registerSchema, type RegisterValues } from '../../features/auth/auth-schemas';
import { GoogleButton } from '../../features/auth/google-button';
import { useSessionUser } from '../../features/auth/use-session';
import { errorMessage } from '../../lib/api/error-message';

export function RegisterPage() {
  const user = useSessionUser();
  const navigate = useNavigate();
  const form = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });
  const mutation = useMutation({
    mutationFn: register,
    onSuccess: () => navigate('/', { replace: true }),
  });

  if (user !== null && !mutation.isPending) {
    return <Navigate to="/" replace />;
  }

  return (
    <Card className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">Create an account</h1>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          void form.handleSubmit((values) => {
            mutation.mutate(values);
          })(event);
        }}
        noValidate
      >
        <Input
          label="Name"
          autoComplete="name"
          error={form.formState.errors.name?.message}
          {...form.register('name')}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        {mutation.isError ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(mutation.error)}
          </p>
        ) : null}
        <Button type="submit" loading={mutation.isPending}>
          Sign up
        </Button>
        <GoogleButton />
      </form>
      <p className="mt-4 text-sm text-muted">
        Already registered?{' '}
        <Link to="/login" className="text-brand">
          Log in
        </Link>
      </p>
    </Card>
  );
}
