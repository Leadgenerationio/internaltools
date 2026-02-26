import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Ad Maker',
  description:
    'Terms of Service for Ad Maker. Covers token billing, acceptable use, content ownership, service availability, and refund policies.',
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

export default function TermsOfServicePage() {
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
            <h1 className="text-xl font-bold text-white">Terms of Service</h1>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-sm text-gray-500 mb-8">
          Last updated: 26 February 2026
        </p>

        <Section title="1. Agreement to Terms">
          <p>
            By creating an account on or using the Ad Maker platform
            (&quot;Service&quot;), operated by [Company Name] (&quot;we&quot;,
            &quot;us&quot;, &quot;our&quot;), you agree to be bound by these
            Terms of Service (&quot;Terms&quot;). If you do not agree, do not
            use the Service.
          </p>
          <p>
            These Terms apply to all users of the Service, including account
            owners, administrators, and team members.
          </p>
        </Section>

        <Section title="2. Description of Service">
          <p>
            Ad Maker is a SaaS platform that enables users to generate
            AI-powered ad copy, upload and process videos, and render finished
            video advertisements with text overlays and background music. The
            Service includes:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>AI ad copy generation using third-party AI models</li>
            <li>AI video generation using third-party AI models (optional)</li>
            <li>Video upload, processing, and rendering via server-side FFmpeg</li>
            <li>Team management with role-based access control</li>
            <li>Token-based billing and subscription management</li>
          </ul>
        </Section>

        <Section title="3. Accounts and Registration">
          <p>
            You must provide accurate information when creating an account. You
            are responsible for maintaining the security of your account
            credentials and for all activity under your account.
          </p>
          <p>
            The person who creates a company account is designated the
            &quot;Owner&quot;. Owners can invite additional team members with
            Admin or Member roles. You are responsible for the actions of all
            users under your company account.
          </p>
        </Section>

        <Section title="4. Token Billing System">
          <p>
            Ad Maker uses a token-based billing model. Tokens are consumed when
            you create content:
          </p>
          <div className="mt-3 bg-gray-800/50 border border-gray-700/60 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 font-medium px-4 py-3">
                    Action
                  </th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">
                    Token Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-700/40">
                  <td className="px-4 py-2.5 text-gray-300">
                    AI ad copy generation
                  </td>
                  <td className="px-4 py-2.5 text-green-400 font-medium">
                    FREE
                  </td>
                </tr>
                <tr className="border-b border-gray-700/40">
                  <td className="px-4 py-2.5 text-gray-300">
                    Render 1 finished video (your own footage)
                  </td>
                  <td className="px-4 py-2.5 text-white font-medium">
                    1 token
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-gray-300">
                    Generate 1 AI video (via Veo)
                  </td>
                  <td className="px-4 py-2.5 text-white font-medium">
                    10 tokens
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Tokens are deducted <em>before</em> the operation begins. If the
            operation fails due to a system error, tokens are automatically
            refunded. Tokens are not refunded for user errors (e.g. uploading
            an unsupported file format).
          </p>
        </Section>

        <Section title="5. Subscription Plans">
          <p>
            We offer the following subscription tiers:
          </p>
          <div className="mt-3 bg-gray-800/50 border border-gray-700/60 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 font-medium px-4 py-3">
                    Plan
                  </th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">
                    Price
                  </th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">
                    Tokens / Month
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-700/40">
                  <td className="px-4 py-2.5 text-gray-300">Free</td>
                  <td className="px-4 py-2.5 text-white">Free</td>
                  <td className="px-4 py-2.5 text-white">40</td>
                </tr>
                <tr className="border-b border-gray-700/40">
                  <td className="px-4 py-2.5 text-gray-300">Starter</td>
                  <td className="px-4 py-2.5 text-white">&pound;29/month</td>
                  <td className="px-4 py-2.5 text-white">500</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-gray-300">Pro</td>
                  <td className="px-4 py-2.5 text-white">&pound;99/month</td>
                  <td className="px-4 py-2.5 text-white">2,500</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Subscriptions are billed monthly. Token allocations reset at the
            start of each billing cycle. Unused tokens do not roll over.
          </p>
          <p>
            Paid plans may purchase additional token top-ups at plan-specific
            rates. Top-up tokens do not expire at the end of the billing cycle.
          </p>
        </Section>

        <Section title="6. Refund Policy">
          <p>
            <strong className="text-white">Subscriptions:</strong> You may
            cancel your subscription at any time. Cancellation takes effect at
            the end of the current billing period. No partial refunds are
            provided for the remaining time in a billing cycle.
          </p>
          <p>
            <strong className="text-white">Token top-ups:</strong> Purchased
            token top-ups are non-refundable once credited to your account.
            If you believe you were charged in error, contact our support team
            within 14 days of the transaction.
          </p>
          <p>
            <strong className="text-white">Failed operations:</strong> Tokens
            consumed by operations that fail due to system errors are
            automatically refunded to your balance. No manual request is
            required.
          </p>
        </Section>

        <Section title="7. Acceptable Use">
          <p>
            You agree not to use Ad Maker for any of the following:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>
              Uploading, generating, or distributing content that is illegal,
              harmful, threatening, abusive, defamatory, obscene, or otherwise
              objectionable.
            </li>
            <li>
              Uploading content that infringes on any third party&apos;s
              intellectual property rights, including copyrighted videos, music,
              or images you do not have the right to use.
            </li>
            <li>
              Creating advertisements that are deceptive, fraudulent, or violate
              advertising standards or regulations.
            </li>
            <li>
              Attempting to gain unauthorised access to other users&apos;
              accounts, data, or company resources.
            </li>
            <li>
              Using automated tools, bots, or scripts to abuse the Service,
              circumvent rate limits, or scrape content.
            </li>
            <li>
              Reverse-engineering, decompiling, or attempting to extract the
              source code of the Service.
            </li>
            <li>
              Reselling or redistributing the Service without our written
              consent.
            </li>
          </ul>
          <p>
            We reserve the right to suspend or terminate accounts that violate
            these terms without prior notice.
          </p>
        </Section>

        <Section title="8. Content Ownership">
          <p>
            <strong className="text-white">Your content:</strong> You retain
            full ownership of all content you upload to or create using Ad
            Maker, including ad briefs, uploaded videos, uploaded music, and
            rendered output videos. We do not claim any intellectual property
            rights over your content.
          </p>
          <p>
            <strong className="text-white">Licence to us:</strong> By uploading
            content, you grant us a limited, non-exclusive licence to process,
            store, and render your content solely for the purpose of providing
            the Service. This licence terminates when you delete the content or
            your account.
          </p>
          <p>
            <strong className="text-white">AI-generated content:</strong> Ad
            copy and AI-generated videos created through our Service are
            provided to you for your use. We make no claim of ownership over
            AI-generated outputs. You are responsible for ensuring your use of
            AI-generated content complies with applicable laws and advertising
            regulations.
          </p>
        </Section>

        <Section title="9. Service Availability">
          <p>
            We strive to maintain high availability of the Service, but we do
            not guarantee uninterrupted or error-free operation. The Service is
            provided &quot;as is&quot; and &quot;as available&quot;.
          </p>
          <p>
            We may perform scheduled or emergency maintenance that temporarily
            limits access to the Service. We will provide reasonable advance
            notice of planned maintenance where possible.
          </p>
          <p>
            We reserve the right to modify, suspend, or discontinue any part of
            the Service with reasonable notice. If we discontinue a paid feature,
            we will provide a pro-rata refund for any prepaid period.
          </p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, [Company Name] shall not be
            liable for any indirect, incidental, special, consequential, or
            punitive damages, including loss of profits, revenue, data, or
            business opportunity, arising from your use of the Service.
          </p>
          <p>
            Our total liability for any claim arising from these Terms or the
            Service shall not exceed the amount you paid to us in the 12 months
            preceding the claim.
          </p>
          <p>
            We are not responsible for the accuracy, quality, or suitability of
            AI-generated ad copy or videos. You are responsible for reviewing
            all generated content before use in advertising campaigns.
          </p>
        </Section>

        <Section title="11. Indemnification">
          <p>
            You agree to indemnify and hold harmless [Company Name], its
            officers, employees, and agents from any claims, damages, losses,
            or expenses (including legal fees) arising from: (a) your use of
            the Service, (b) your content, (c) your violation of these Terms,
            or (d) your violation of any third-party rights.
          </p>
        </Section>

        <Section title="12. Termination">
          <p>
            <strong className="text-white">By you:</strong> You may delete your
            account at any time from the Settings page. Account deletion will
            remove your personal data and content within 30 days.
          </p>
          <p>
            <strong className="text-white">By us:</strong> We may suspend or
            terminate your account if you violate these Terms, engage in
            abusive behaviour, or fail to pay for a subscription. We will
            provide notice where practicable.
          </p>
          <p>
            Upon termination, your right to use the Service ceases immediately.
            We will retain data as required by law or as described in our
            Privacy Policy.
          </p>
        </Section>

        <Section title="13. Governing Law">
          <p>
            These Terms are governed by and construed in accordance with the
            laws of England and Wales. Any disputes shall be subject to the
            exclusive jurisdiction of the courts of England and Wales.
          </p>
        </Section>

        <Section title="14. Changes to These Terms">
          <p>
            We may update these Terms from time to time. We will notify
            registered users of material changes by email or in-app
            notification at least 30 days before the changes take effect.
            Continued use of the Service after the effective date constitutes
            acceptance of the updated Terms.
          </p>
        </Section>

        <Section title="15. Contact">
          <p>
            If you have questions about these Terms of Service, please contact
            us:
          </p>
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-lg p-4 mt-3">
            <p>
              <strong className="text-white">[Company Name]</strong>
            </p>
            <p>
              Email:{' '}
              <a
                href="mailto:legal@admaker.app"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                legal@admaker.app
              </a>
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
              href="/privacy"
              className="hover:text-gray-300 transition-colors"
            >
              Privacy Policy
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
