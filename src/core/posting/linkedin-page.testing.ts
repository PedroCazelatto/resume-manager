// A LinkedIn public job page for tests, written by hand (F46). It has the element classes, the
// nesting and the JSON-LD shape of a real public job page checked on 2026-11-22, which wasn't
// kept: the job, the company and every text here are fictional (Art. III.3, III.5).

/** The page's JobPosting data, shaped as LinkedIn writes it: the description is HTML escaped once more. */
export const LINKEDIN_JOB_POSTING = {
  "@context": "http://schema.org",
  "@type": "JobPosting",
  datePosted: "2026-11-01T09:00:00.000Z",
  description:
    "We build payment systems for small shops.&lt;br&gt;&lt;br&gt;&lt;strong&gt;What you will do&lt;/strong&gt;&lt;ul&gt;&lt;li&gt;Design TypeScript services&lt;/li&gt;&lt;li&gt;Run them on PostgreSQL&lt;/li&gt;&lt;/ul&gt;",
  employmentType: "FULL_TIME",
  hiringOrganization: {
    "@type": "Organization",
    name: "Globex",
    sameAs: "https://www.linkedin.com/company/globex",
    logo: "https://media.licdn.com/dms/image/globex-logo",
  },
  identifier: { "@type": "PropertyValue", name: "Globex", value: "100000000000000001" },
  image: "https://media.licdn.com/dms/image/globex-logo",
  industry: "Software Development",
  jobLocation: {
    "@type": "Place",
    address: { "@type": "PostalAddress", addressCountry: "IE", addressLocality: "Dublin", addressRegion: null, streetAddress: null },
    latitude: 53.35,
    longitude: -6.26,
  },
  skills: "",
  title: "Backend Engineer",
  validThrough: "2026-12-01T09:00:00.000Z",
  educationRequirements: { "@type": "EducationalOccupationalCredential", credentialCategory: "bachelor degree" },
  experienceRequirements: { "@type": "OccupationalExperienceRequirements", monthsOfExperience: 24 },
};

/**
 * The page, with its JobPosting data (or another block in its place). Its top card and job criteria
 * differ from the data in the title, the location (as on the real page: "Dublin, County Dublin,
 * Ireland" against "Dublin" and "IE") and the employment type, so a test can tell which was read.
 */
export function linkedInJobPage(posting: unknown = LINKEDIN_JOB_POSTING): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Senior Backend Engineer at Globex — Dublin, County Dublin, Ireland | LinkedIn Jobs</title>
    <script type="application/ld+json">${JSON.stringify(posting).replace(/<\//g, "<\\/")}</script>
    <script>window.tracking = { recaptcha: "enabled" };</script>
  </head>
  <body>
    <header class="global-nav"><nav><a href="https://www.linkedin.com/">LinkedIn</a><a href="https://www.linkedin.com/login">Sign in</a></nav></header>
    <main class="main" id="main-content">
      <section class="core-rail">
        <div class="details">
          <section class="top-card-layout">
            <div class="top-card-layout__card">
              <div class="top-card-layout__entity-info-container">
                <div class="top-card-layout__entity-info">
                  <h1 class="top-card-layout__title font-sans text-lg font-bold topcard__title">Senior Backend Engineer</h1>
                  <h4 class="top-card-layout__second-subline font-sans text-sm">
                    <div class="topcard__flavor-row">
                      <span class="topcard__flavor">
                        <a class="topcard__org-name-link topcard__flavor--black-link" href="https://www.linkedin.com/company/globex">
                          Globex
                        </a>
                      </span>
                      <span class="topcard__flavor topcard__flavor--bullet">
                        Dublin, County Dublin, Ireland
                      </span>
                    </div>
                    <div class="topcard__flavor-row">
                      <span class="posted-time-ago__text topcard__flavor--metadata">1 week ago</span>
                      <span class="num-applicants__caption topcard__flavor--metadata topcard__flavor--bullet">101 applicants</span>
                    </div>
                  </h4>
                  <a class="face-pile see-who-was-hired" href="https://www.linkedin.com/login"><p class="face-pile__text">See who Globex has hired for this role</p></a>
                </div>
              </div>
              <div class="top-card-layout__cta-container">
                <button class="sign-up-modal__outlet top-card-layout__cta top-card-layout__cta--primary">Apply</button>
                <div class="contextual-sign-in-modal">
                  <h2 class="contextual-sign-in-modal__context-screen-title">Join or sign in to find your next job</h2>
                  <p class="contextual-sign-in-modal__subtitle"><span>Join to apply for the role at <strong>Senior Backend Engineer</strong> at <strong>Globex</strong></span></p>
                  <form class="contextual-sign-in-modal__sign-in-form"><label class="input-label">Email or phone</label><input><button>Sign in</button></form>
                </div>
                <a class="top-card-layout__cta top-card-layout__cta--secondary" href="https://www.linkedin.com/login">Save</a>
              </div>
            </div>
          </section>
          <div class="decorated-job-posting__details">
            <section class="core-section-container">
              <div class="core-section-container__content break-words">
                <div class="description__text description__text--rich">
                  <section class="show-more-less-html">
                    <div class="show-more-less-html__markup show-more-less-html__markup--clamp-after-20 relative overflow-hidden">
                      We build payment systems for small shops.<br><br><strong>What you will do</strong><ul><li>Design TypeScript services</li><li>Run them on PostgreSQL</li></ul>
                    </div>
                    <button class="show-more-less-html__button show-more-less-html__button--more">Show more</button>
                    <button class="show-more-less-html__button show-more-less-html__button--less">Show less</button>
                  </section>
                </div>
              </div>
            </section>
            <section class="core-section-container">
              <div class="core-section-container__content break-words">
                <ul class="description__job-criteria-list">
                  <li class="description__job-criteria-item">
                    <h3 class="description__job-criteria-subheader">Seniority level</h3>
                    <span class="description__job-criteria-text description__job-criteria-text--criteria">Mid-Senior level</span>
                  </li>
                  <li class="description__job-criteria-item">
                    <h3 class="description__job-criteria-subheader">Employment type</h3>
                    <span class="description__job-criteria-text description__job-criteria-text--criteria">Part-time</span>
                  </li>
                  <li class="description__job-criteria-item">
                    <h3 class="description__job-criteria-subheader">Industries</h3>
                    <span class="description__job-criteria-text description__job-criteria-text--criteria">Software Development</span>
                  </li>
                </ul>
              </div>
            </section>
          </div>
        </div>
        <section class="similar-jobs"><h2>Similar jobs</h2><ul><li><a href="https://ie.linkedin.com/jobs/view/frontend-engineer-at-initech-2">Frontend Engineer at Initech</a></li></ul></section>
      </section>
    </main>
    <footer class="li-footer">© 2026 LinkedIn</footer>
  </body>
</html>`;
}
