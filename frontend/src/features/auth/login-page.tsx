import { Link, useSearchParams } from 'react-router';

import { Alert } from '@/components/ui/alert';
import { safeNextPath } from '@/lib/safe-next-path';

import { authLink } from './auth-link';
import { AuthPageHeader } from './auth-page-parts';
import { LoginForm } from './login-form';

function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const reason = params.get('reason');

  return (
    <>
      <AuthPageHeader title="Sign in" description="Pick up your search where you left it." />
      {reason === 'expired' && (
        <Alert tone="info" className="mt-6">
          Your session expired. Sign in again to carry on.
        </Alert>
      )}
      {reason === 'deleted' && (
        <Alert tone="info" className="mt-6">
          Your account and everything in it have been deleted.
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
    </>
  );
}

export { LoginPage };
