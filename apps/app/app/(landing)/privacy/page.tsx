import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "@/components/legal-document";

export const metadata: Metadata = {
	title: "Privacy Policy",
	description:
		"How Vault Zero CRM collects, uses, and protects information on the hosted service at crm.vaultzero.dev.",
};

const EFFECTIVE_DATE = "August 19, 2026";

export default function PrivacyPage() {
	return (
		<LegalDocument
			title="Privacy Policy"
			description={`Effective ${EFFECTIVE_DATE}. This policy describes the hosted Vault Zero CRM service at crm.vaultzero.dev operated by Vault Zero.`}
		>
			<LegalSection title="Who we are">
				<p>
					Vault Zero CRM is an acquisition CRM with an integrated research
					agent. The hosted service at{" "}
					<a href="https://crm.vaultzero.dev">crm.vaultzero.dev</a> is operated
					by Vault Zero (<a href="https://www.vaultzero.dev">vaultzero.dev</a>).
					Questions about this policy can be sent to{" "}
					<a href="mailto:privacy@vaultzero.dev">privacy@vaultzero.dev</a>.
				</p>
				<p>
					Vault Zero CRM is open source. If you run your own copy, the operator
					of that deployment is responsible for privacy on that instance. This
					policy applies only to the service we host.
				</p>
			</LegalSection>

			<LegalSection title="Information we collect">
				<p>
					<strong>Account information.</strong> When you create an account, we
					collect your name, email address, and authentication credentials. If
					you sign in with Google or Microsoft, we receive basic profile
					information from that provider.
				</p>
				<p>
					<strong>Google data.</strong> If you connect Google, we request
					read-only access to Gmail and Google Calendar so meetings and email
					threads can appear on the right company in your workspace. We store
					metadata and message content only for conversations tied to companies
					in your CRM. Personal mail that does not relate to a tracked company
					is not saved.
				</p>
				<p>
					<strong>CRM content.</strong> We store the records you and your
					workspace create or import, including companies, contacts, deals,
					tasks, notes, research results, and related files.
				</p>
				<p>
					<strong>Usage and technical data.</strong> We collect standard service
					logs, device and browser information, IP address, and product
					telemetry needed to operate, secure, and improve the service.
				</p>
			</LegalSection>

			<LegalSection title="How we use information">
				<p>We use the information above to:</p>
				<ul className="list-disc space-y-2 pl-5">
					<li>provide, maintain, and secure the CRM and research agent</li>
					<li>authenticate you and manage your workspace membership</li>
					<li>sync email and calendar data you choose to connect</li>
					<li>run automated research tasks you or your workspace trigger</li>
					<li>respond to support requests and enforce our terms</li>
					<li>measure reliability and improve the product</li>
				</ul>
				<p>We do not sell your personal information.</p>
			</LegalSection>

			<LegalSection title="How the research agent uses data">
				<p>
					The research agent may read CRM records and, when you connect Google,
					email and calendar data needed to enrich companies and contacts. When
					optional third-party research keys are configured for your workspace,
					the agent may send names, domains, employers, and similar business
					context to those providers to answer a research task. We configure the
					hosted service to minimize outbound data and to write only verified
					findings back to your records.
				</p>
			</LegalSection>

			<LegalSection title="How we share information">
				<p>
					We share information only as needed to run the service, including:
				</p>
				<ul className="list-disc space-y-2 pl-5">
					<li>
						infrastructure providers that host the application and database
					</li>
					<li>
						authentication providers you choose, such as Google or Microsoft
					</li>
					<li>
						AI, search, or enrichment providers invoked by a research task you
						start or schedule
					</li>
					<li>
						professional advisers or authorities when required by law or to
						protect rights, safety, and security
					</li>
				</ul>
				<p>
					Other members of your workspace can access records inside that
					workspace according to your workspace membership.
				</p>
			</LegalSection>

			<LegalSection title="Retention">
				<p>
					We keep account and CRM data while your account or workspace is
					active. If you delete your account or ask us to remove hosted data, we
					delete or anonymize it within a reasonable period, except where we
					must keep limited records for security, billing, or legal compliance.
				</p>
			</LegalSection>

			<LegalSection title="Security">
				<p>
					We use encryption in transit, access controls, and industry-standard
					hosting practices. No method of transmission or storage is completely
					secure. Report security issues through the process described in our
					open-source security policy.
				</p>
			</LegalSection>

			<LegalSection title="Your choices and rights">
				<p>You can:</p>
				<ul className="list-disc space-y-2 pl-5">
					<li>update workspace and profile information in the product</li>
					<li>
						disconnect Google or Microsoft from workspace settings where
						available
					</li>
					<li>
						request access, correction, export, or deletion by emailing{" "}
						<a href="mailto:privacy@vaultzero.dev">privacy@vaultzero.dev</a>
					</li>
				</ul>
				<p>
					Depending on where you live, you may have additional privacy rights.
					We will respond to verified requests within the time required by
					applicable law.
				</p>
			</LegalSection>

			<LegalSection title="Children">
				<p>
					The service is not directed to children under 16, and we do not
					knowingly collect personal information from them.
				</p>
			</LegalSection>

			<LegalSection title="International transfers">
				<p>
					We may process information in the United States and other countries
					where we or our service providers operate. We take steps designed to
					protect information when it is transferred internationally.
				</p>
			</LegalSection>

			<LegalSection title="Changes">
				<p>
					We may update this policy from time to time. If we make material
					changes, we will post the updated policy on this page and revise the
					effective date above.
				</p>
			</LegalSection>
		</LegalDocument>
	);
}
