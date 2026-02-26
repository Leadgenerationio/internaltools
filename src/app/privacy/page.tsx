import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Ad Maker',
  description:
    'How Ad Maker collects, uses, and protects your data. GDPR-compliant privacy policy covering AI services, video processing, and data retention.',
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-white mb-4">{title}</h2>
      <div className="text-sm text-gray-300 leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/welcome"
              className="text-gray-400 hover:text-white text-sm"
            >
              &larr; Back
            </Link>
            <h1 className="text-xl font-bold text-white">Privacy Policy</h1>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-sm text-gray-500 mb-8">
          Last updated: 26 February 2026
        </p>

        <Section title="1. Introduction">
          <p>
            This Privacy Policy explains how [Company Name], operating the Ad
            Maker platform (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;),
            collects, uses, stores, and protects your personal data when you use
            our services. Ad Maker is a SaaS platform for AI-powered ad copy
            generation and video rendering.
          </p>
          <p>
            We are committed to protecting your privacy and complying with the
            UK General Data Protection Regulation (UK GDPR) and the Data
            Protection Act 2018. By using Ad Maker, you agree to the practices
            described in this policy.
          </p>
        </Section>

        <Section title="2. Data We Collect">
          <p>We collect the following categories of personal data:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>
              <strong className="text-white">Account information:</strong> Name,
              email address, company name, and hashed password when you register
              or are invited to a team.
            </li>
            <li>
              <strong className="text-white">Billing data:</strong> Subscription
              plan, token balance, transaction history, and payment information
              processed through Stripe (we do not store full card numbers).
            </li>
            <li>
              <strong className="text-white">Content you provide:</strong> Ad
              briefs, generated ad copy, uploaded videos, uploaded music files,
              and rendered output videos.
            </li>
            <li>
              <strong className="text-white">Usage data:</strong> Token
              consumption, feature usage, API call logs, login timestamps, and
              IP addresses.
            </li>
            <li>
              <strong className="text-white">Technical data:</strong> Browser
              type, operating system, device information, and server logs for
              debugging and security.
            </li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Data">
          <p>We process your data for the following purposes:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>
              <strong className="text-white">Service delivery:</strong>{' '}
              Generating AI ad copy, processing and rendering videos, managing
              your account and team.
            </li>
            <li>
              <strong className="text-white">Billing and payments:</strong>{' '}
              Processing subscriptions, token purchases, and tracking usage
              against your plan.
            </li>
            <li>
              <strong className="text-white">Security:</strong> Authenticating
              sessions, preventing abuse, enforcing rate limits, and maintaining
              audit logs.
            </li>
            <li>
              <strong className="text-white">Improvement:</strong> Analysing
              usage patterns to improve features, fix bugs, and optimise
              performance.
            </li>
            <li>
              <strong className="text-white">Communication:</strong> Sending
              password resets, team invitations, budget alerts, and service
              notifications.
            </li>
          </ul>
        </Section>

        <Section title="4. Third-Party Services">
          <p>
            We share data with the following third-party services as necessary
            to provide our platform:
          </p>
          <div className="mt-3 space-y-4">
            <div className="bg-gray-800/50 border border-gray-700/60 rounded-lg p-4">
              <h3 className="text-white font-medium mb-1">
                Anthropic (Claude AI)
              </h3>
              <p>
                Your ad briefs are sent to Anthropic&apos;s Claude API to
                generate ad copy. Anthropic processes this data under their{' '}
                <a
                  href="https://www.anthropic.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  privacy policy
                </a>
                . Anthropic does not use API inputs to train their models.
              </p>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/60 rounded-lg p-4">
              <h3 className="text-white font-medium mb-1">
                Google (Veo Video Generation)
              </h3>
              <p>
                If you use AI video generation, text prompts are sent to
                Google&apos;s Veo API. Generated videos are downloaded and
                stored on our infrastructure. Google processes this data under
                their{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  privacy policy
                </a>
                .
              </p>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/60 rounded-lg p-4">
              <h3 className="text-white font-medium mb-1">
                Stripe (Payments)
              </h3>
              <p>
                Payment processing is handled by Stripe. We do not store your
                full payment card details. Stripe processes data under their{' '}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  privacy policy
                </a>
                .
              </p>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/60 rounded-lg p-4">
              <h3 className="text-white font-medium mb-1">
                Railway (Hosting)
              </h3>
              <p>
                Our platform is hosted on Railway with data processing in EU/UK
                regions. Railway provides the infrastructure for running our
                application, database, and persistent storage.
              </p>
            </div>
          </div>
        </Section>

        <Section title="5. Cookies and Authentication">
          <p>We use the following cookies:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>
              <strong className="text-white">Session cookie</strong> (httpOnly,
              Secure): A JWT token used to authenticate your session. This is
              strictly necessary for the service to function and does not
              require consent.
            </li>
          </ul>
          <p>
            We do not use analytics cookies, tracking pixels, or third-party
            advertising cookies. We do not participate in ad networks or sell
            your data to advertisers.
          </p>
        </Section>

        <Section title="6. Data Retention">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-white">Account data:</strong> Retained for
              the lifetime of your account. Deleted within 30 days of account
              deletion.
            </li>
            <li>
              <strong className="text-white">
                Uploaded videos and rendered outputs:
              </strong>{' '}
              Retained while your account is active. Temporary processing files
              are cleaned up automatically within 24 hours.
            </li>
            <li>
              <strong className="text-white">Ad briefs and generated copy:</strong>{' '}
              Retained within your projects for the lifetime of your account.
            </li>
            <li>
              <strong className="text-white">Usage and billing logs:</strong>{' '}
              Retained for 12 months for auditing and billing dispute
              resolution.
            </li>
            <li>
              <strong className="text-white">Server logs:</strong> Retained for
              30 days for debugging and security monitoring.
            </li>
          </ul>
        </Section>

        <Section title="7. Data Security">
          <p>We protect your data with the following measures:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>Passwords are hashed using bcrypt before storage.</li>
            <li>
              Sessions use JWT tokens in httpOnly, Secure cookies that cannot be
              accessed by client-side JavaScript.
            </li>
            <li>
              All API routes enforce authentication and role-based access
              control (OWNER, ADMIN, MEMBER).
            </li>
            <li>
              Rate limiting is applied to all API endpoints to prevent abuse.
            </li>
            <li>
              Data is isolated by company — users can only access data belonging
              to their own company.
            </li>
            <li>
              All connections are encrypted via TLS/HTTPS in production.
            </li>
          </ul>
        </Section>

        <Section title="8. Your Rights (GDPR)">
          <p>
            Under the UK GDPR, you have the following rights regarding your
            personal data:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>
              <strong className="text-white">Right of access:</strong> Request a
              copy of all personal data we hold about you.
            </li>
            <li>
              <strong className="text-white">Right to rectification:</strong>{' '}
              Request correction of inaccurate personal data.
            </li>
            <li>
              <strong className="text-white">Right to erasure:</strong> Request
              deletion of your account and all associated data.
            </li>
            <li>
              <strong className="text-white">Right to data portability:</strong>{' '}
              Request your data in a machine-readable format (CSV export is
              available for usage data).
            </li>
            <li>
              <strong className="text-white">
                Right to restrict processing:
              </strong>{' '}
              Request that we limit how we use your data.
            </li>
            <li>
              <strong className="text-white">Right to object:</strong> Object to
              processing of your data for specific purposes.
            </li>
          </ul>
          <p>
            To exercise any of these rights, contact us at the email address
            below. We will respond within 30 days.
          </p>
        </Section>

        <Section title="9. International Data Transfers">
          <p>
            Our primary infrastructure is hosted in EU/UK regions via Railway.
            When you use AI features, data may be processed by Anthropic
            (United States) and Google (United States). These transfers are
            covered by appropriate safeguards including Standard Contractual
            Clauses (SCCs) as required by UK GDPR.
          </p>
        </Section>

        <Section title="10. Children&apos;s Privacy">
          <p>
            Ad Maker is not intended for use by individuals under 18 years of
            age. We do not knowingly collect personal data from children. If we
            become aware that we have collected data from a child, we will
            delete it promptly.
          </p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify
            registered users of material changes by email or in-app
            notification. The &quot;Last updated&quot; date at the top of this
            page indicates when this policy was last revised.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            If you have questions about this Privacy Policy, wish to exercise
            your data rights, or want to make a complaint, please contact us:
          </p>
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-lg p-4 mt-3">
            <p>
              <strong className="text-white">[Company Name]</strong>
            </p>
            <p>
              Email:{' '}
              <a
                href="mailto:privacy@admaker.app"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                privacy@admaker.app
              </a>
            </p>
            <p className="mt-2 text-gray-400">
              You also have the right to lodge a complaint with the Information
              Commissioner&apos;s Office (ICO) at{' '}
              <a
                href="https://ico.org.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                ico.org.uk
              </a>
              .
            </p>
          </div>
        </Section>
      </div>

      <footer className="border-t border-gray-800/60 py-8">
        <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} Ad Maker. All rights reserved.
          </span>
          <nav className="flex items-center gap-6 text-xs text-gray-500">
            <Link
              href="/terms"
              className="hover:text-gray-300 transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/help"
              className="hover:text-gray-300 transition-colors"
            >
              Help Center
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
