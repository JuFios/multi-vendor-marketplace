import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Input } from '../../components/input';
import { login } from '../../features/auth/api/auth-api';
import { loginSchema, type LoginValues } from '../../features/auth/auth-schemas';
import { GoogleButton } from '../../features/auth/google-button';
import { useSessionUser } from '../../features/auth/use-session';
import { errorMessage } from '../../lib/api/error-message';

export function LoginPage() {
  const user = useSessionUser();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: () => navigate(from, { replace: true }),
  });

  if (user !== null && !mutation.isPending) {
    return <Navigate to={from} replace />;
  }

  return (
    <Card className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">Log in</h1>
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
          label="Email"
          type="email"
          autoComplete="email"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        {mutation.isError ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(mutation.error)}
          </p>
        ) : null}
        <Button type="submit" loading={mutation.isPending}>
          Log in
        </Button>
        <GoogleButton />
      </form>
      <p className="mt-4 text-sm text-muted">
        No account yet?{' '}
        <Link to="/register" className="text-brand">
          Sign up
        </Link>
      </p>
    </Card>
  );
}
