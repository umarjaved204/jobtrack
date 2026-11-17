import { Link, useSearchParams } from 'react-router';

import { safeNextPath } from '@/lib/safe-next-path';

import { authLink } from './auth-link';
import { AuthPageHeader } from './auth-page-parts';
import { RegisterForm } from './register-form';

function RegisterPage() {
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));

  return (
    <>
      <AuthPageHeader
        title="Create your account"
        description="Track every application, interview and offer in one place."
      />
      <div className="mt-8">
        <RegisterForm next={next} />
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to={authLink('/login', params.get('next'))} className="link">
          Sign in
        </Link>
      </p>
    </>
  );
}

export { RegisterPage };
