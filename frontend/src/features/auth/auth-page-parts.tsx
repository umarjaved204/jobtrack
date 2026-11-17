/** Title block for the sign-in / sign-up pages (also sets the document title). */
function AuthPageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <title>{`${title} · JobTrack`}</title>
      <h1 className="display-face text-display">{title}</h1>
      <p className="mt-3 text-muted-foreground">{description}</p>
    </header>
  );
}

export { AuthPageHeader };
