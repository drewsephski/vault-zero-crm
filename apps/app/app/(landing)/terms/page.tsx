import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "@/components/legal-document";

export const metadata: Metadata = {
	title: "Terms of Service",
	description:
		"Terms governing use of the hosted Vault Zero CRM service at crm.vaultzero.dev.",
};

const EFFECTIVE_DATE = "August 19, 2026";

export default function TermsPage() {
	return (
		<LegalDocument
			title="Terms of Service"
			description={`Effective ${EFFECTIVE_DATE}. By using the hosted Vault Zero CRM service at crm.vaultzero.dev, you agree to these terms.`}
		>
			<LegalSection title="Agreement">
				<p>
					These Terms of Service are a legal agreement between you and Vault
					Zero for use of the hosted Vault Zero CRM service at{" "}
					<a href="https://crm.vaultzero.dev">crm.vaultzero.dev</a> (
					<strong>Service</strong>). If you do not agree, do not use the
					Service.
				</p>
				<p>
					If you use the Service on behalf of a company, you represent that you
					have authority to bind that company, and{" "}
					<strong>you</strong> means that company.
				</p>
			</LegalSection>

			<LegalSection title="The Service">
				<p>
					Vault Zero CRM helps teams discover, research, qualify, and advance
					acquisition opportunities. The Service includes a web application, an
					API, optional Google and Microsoft integrations, and an automated
					research agent. Features may change over time.
				</p>
				<p>
					The software is also available under an open-source licence for
					self-hosting. These terms apply only to the hosted Service operated by
					Vault Zero, not to separate deployments you run yourself.
				</p>
			</LegalSection>

			<LegalSection title="Accounts and workspaces">
				<p>
					You must provide accurate account information and keep your credentials
					secure. You are responsible for activity under your account and for
					actions taken inside workspaces where you are a member.
				</p>
				<p>
					Workspace owners and administrators can manage membership, connected
					integrations, and workspace settings. You are responsible for
					inviting only people who should have access to your workspace data.
				</p>
			</LegalSection>

			<LegalSection title="Connected accounts">
				<p>
					If you connect Google or Microsoft, you authorize Vault Zero to
					access the scopes shown during connection. For Google, that includes
					read-only Gmail and Calendar access when you grant it. You can revoke
					access through workspace settings or through the provider&apos;s
					account permissions page.
				</p>
				<p>
					Your use of Google and Microsoft services remains subject to their
					terms and policies.
				</p>
			</LegalSection>

			<LegalSection title="Acceptable use">
				<p>You agree not to:</p>
				<ul className="list-disc space-y-2 pl-5">
					<li>break the law or infringe others&apos; rights</li>
					<li>
						probe, scan, or test the vulnerability of the Service without
						permission
					</li>
					<li>
						interfere with or disrupt the Service, other accounts, or connected
						systems
					</li>
					<li>
						upload malware or attempt to access data outside your authorized
						workspaces
					</li>
					<li>
						use the Service to send unsolicited communications or to harass
						others
					</li>
					<li>
						misrepresent your identity or scrape the Service in a way that
						bypasses technical limits
					</li>
				</ul>
				<p>
					We may investigate misuse and suspend or terminate access to protect
					the Service and its users.
				</p>
			</LegalSection>

			<LegalSection title="Customer content">
				<p>
					You retain ownership of the information and records you submit to the
					Service (<strong>Customer Content</strong>). You grant Vault Zero a
					limited licence to host, process, transmit, and display Customer
					Content solely to provide and improve the Service, comply with law, and
					enforce these terms.
				</p>
				<p>
					You are responsible for obtaining any rights and notices needed to
					collect and use Customer Content, including data obtained from email,
					calendar, and third-party sources.
				</p>
			</LegalSection>

			<LegalSection title="Research agent">
				<p>
					The research agent may automatically read connected sources, run
					external lookups, and write results into your workspace. You are
					responsible for reviewing automated output before relying on it for
					business decisions. The agent is designed to avoid guessing facts about
					people, but no automated system is perfect.
				</p>
			</LegalSection>

			<LegalSection title="Third-party services">
				<p>
					The Service may rely on or link to third-party services, including
					cloud hosting, authentication providers, AI models, and search APIs.
					Those services are governed by their own terms. Vault Zero is not
					responsible for third-party services we do not control.
				</p>
			</LegalSection>

			<LegalSection title="Disclaimers">
				<p>
					THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot;
					TO THE MAXIMUM EXTENT PERMITTED BY LAW, VAULT ZERO DISCLAIMS ALL
					WARRANTIES, WHETHER EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES
					OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
					NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
					UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE.
				</p>
			</LegalSection>

			<LegalSection title="Limitation of liability">
				<p>
					TO THE MAXIMUM EXTENT PERMITTED BY LAW, VAULT ZERO WILL NOT BE LIABLE
					FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
					DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING
					FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM
					RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF USD $100 OR THE
					AMOUNT YOU PAID US FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE
					EVENT GIVING RISE TO THE CLAIM.
				</p>
			</LegalSection>

			<LegalSection title="Suspension and termination">
				<p>
					You may stop using the Service at any time. We may suspend or
					terminate access if you violate these terms, create risk for other
					users, or if we discontinue the Service. Sections that by their nature
					should survive termination will survive, including disclaimers,
					limitations of liability, and governing law.
				</p>
			</LegalSection>

			<LegalSection title="Changes">
				<p>
					We may update these terms from time to time. If we make material
					changes, we will post the updated terms on this page and revise the
					effective date above. Continued use after changes become effective
					means you accept the updated terms.
				</p>
			</LegalSection>

			<LegalSection title="Governing law">
				<p>
					These terms are governed by the laws of the State of Delaware, United
					States, without regard to conflict-of-law rules. Courts located in
					Delaware will have exclusive jurisdiction over disputes arising from
					these terms or the Service, except where applicable law requires
					otherwise.
				</p>
			</LegalSection>

			<LegalSection title="Contact">
				<p>
					Questions about these terms can be sent to{" "}
					<a href="mailto:legal@vaultzero.dev">legal@vaultzero.dev</a>.
				</p>
			</LegalSection>
		</LegalDocument>
	);
}
