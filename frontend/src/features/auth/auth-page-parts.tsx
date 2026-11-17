/** Title block for the sign-in / sign-up pages (also sets the document title). */
function AuthPageHeader({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <header>
      <title>{`${title} · JobTrack`}</title>
      <p className="kicker text-primary-text">{kicker}</p>
      <h1 className="mt-2 display-face text-display">{title}</h1>
      <p className="mt-3 text-muted-foreground">{description}</p>
    </header>
  );
}

export { AuthPageHeader };
