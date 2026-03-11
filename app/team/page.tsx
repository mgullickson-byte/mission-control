export default function TeamPage() {
  return (
    <main className="page-shell">
      <header className="team-header">
        <div>
          <h1 className="page-title-main">Team</h1>
          <p className="page-subtitle-main">
            The digital org chart: you, your agents, and our shared mission.
          </p>
        </div>
      </header>

      <section className="team-body">
        <section className="team-mission">
          <h2 className="section-title">Mission Statement</h2>
          <p className="section-help">
            Mission Control exists to turn Select Casting and Studio Awesome&apos;s ideas
            into finished, delivered work without chaos.
          </p>
        </section>

        <section className="team-grid">
          <article className="team-card">
            <h3 className="team-name">Mike</h3>
            <p className="team-role">Founder / Director</p>
            <p className="team-description">
              Human in the loop. Sets direction, defines what matters, and
              decides which opportunities to pursue.
            </p>
          </article>

          <article className="team-card">
            <h3 className="team-name">Henry</h3>
            <p className="team-role">Mission Control Operator</p>
            <p className="team-description">
              Main OpenClaw agent. Orchestrates tasks, keeps track of leads and
              projects, and coordinates with all sub-agents so work actually
              gets finished.
            </p>
          </article>

          <article className="team-card">
            <h3 className="team-name">Scout</h3>
            <p className="team-role">Select Casting Lead Research</p>
            <p className="team-description">
              Finds, enriches, and prioritizes small/mid-sized ad agency leads
              for Select Casting and keeps the pipeline moving.
            </p>
          </article>

          <article className="team-card">
            <h3 className="team-name">Echo</h3>
            <p className="team-role">Studio Awesome Lead Research</p>
            <p className="team-description">
              Identifies and maintains lead lists for Studio Awesome (mix, ADR,
              and local audio post), starting with the radius around 1608
              Argyle.
            </p>
          </article>

          <article className="team-card">
            <h3 className="team-name">Radar</h3>
            <p className="team-role">Advertising News &amp; Trends</p>
            <p className="team-description">
              Surfaces relevant advertising news, deals, and social trends so we
              can spot opportunities for Select Casting and Studio Awesome.
            </p>
          </article>

          <article className="team-card">
            <h3 className="team-name">Forge</h3>
            <p className="team-role">Builder / Code</p>
            <p className="team-description">
              Builds and improves our software: Mission Control itself, the
              Studio Awesome Mix booking app, and any small tools we need.
            </p>
          </article>

          <article className="team-card">
            <h3 className="team-name">Quill</h3>
            <p className="team-role">Docs &amp; Content</p>
            <p className="team-description">
              Writes blog posts, strategy docs, site copy, and internal notes so
              our thinking is clear and reusable (including Select Casting SEO
              content).
            </p>
          </article>
        </section>
      </section>
    </main>
  );
}
