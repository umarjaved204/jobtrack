import { Link, useSearchParams } from 'react-router';

import { Alert } from '@/components/ui/alert';
import { safeNextPath } from '@/lib/safe-next-path';

import { authLink } from './auth-link';
import { AuthPageHeader } from './auth-page-parts';
import { LoginForm } from './login-form';

function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const expired = params.get('reason') === 'expired';

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <AuthPageHeader
        kicker="Welcome back"
        title="Sign in"
        description="Pick up your search where you left it."
      />
      {expired && (
        <Alert tone="info" className="mt-6">
          Your session expired. Sign in again to carry on.
        </Alert>
      )}
      <div className="mt-8">
        <LoginForm next={next} />
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        New to JobTrack?{' '}
        <Link to={authLink('/register', params.get('next'))} className="link">
          Create an account
        </Link>
      </p>
    </main>
  );
}

export { LoginPage };
