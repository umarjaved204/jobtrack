import { PageHeader } from '@/components/page-header';

/** Route target for the auth guards. The sign-in form replaces this in the next commit. */
function LoginPage() {
  return (
    <main className="mx-auto max-w-page px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader kicker="Welcome back" title="Sign in" />
    </main>
  );
}

export { LoginPage };
