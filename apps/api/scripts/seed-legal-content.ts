// One-time, manual-run script — seeds the two Disclaimer rows the mandatory
// Terms & Conditions / Privacy Policy acceptance system reads:
//   - 'terms-and-conditions' — the general platform Terms, whose `version`
//     field is the single authoritative "current Terms version" every
//     TermsAcceptance row pins (see terms.service.ts).
//   - 'privacy-policy' — served for reading via the same public
//     GET /api/content/disclaimers/:key endpoint; does not carry its own
//     acceptance-version dimension (the one mandatory checkbox covers both
//     documents at once, gated on the Terms version only).
//
// Idempotent (upsert by key, mirrors the existing admin Content Control
// upsert path in content.service.ts) — safe to re-run. Does NOT touch or
// remove the pre-existing 'verification-terms' Disclaimer row (the 7-day
// claim-window-specific disclaimer already shown contextually on the
// verification request detail page) — this script is purely additive.
//
// IMPORTANT — flagged for legal/business review, not invented here:
//   - No governing-law/jurisdiction is specified anywhere in this
//     repository. Section X below deliberately does NOT assert one.
//   - No registered company name, office address, CIN/license number, or
//     dedicated legal-contact email/phone exists anywhere in this
//     repository. Section Y below deliberately points only at the
//     already-existing, real in-app Support feature rather than inventing
//     contact details.
//   - This content has not been reviewed by a lawyer. It is written to be
//     legally careful (no absolute "never responsible" language, explicit
//     "subject to applicable law" carve-outs throughout) but must go
//     through real legal review before this is relied on in production.
import 'dotenv/config'
import prisma from '../src/lib/prisma.js'

const TERMS_KEY = 'terms-and-conditions'
const PRIVACY_KEY = 'privacy-policy'

const TERMS_BODY = `These Terms & Conditions ("Terms") govern your access to and use of CivilCheck. By creating an account or continuing to use CivilCheck, you agree to these Terms and to CivilCheck's Privacy Policy. If you do not agree, please do not use CivilCheck.

A. PLATFORM ROLE

CivilCheck is a technology/platform marketplace that facilitates access to property-related information, verification services, and participating professionals. CivilCheck does not guarantee that every listing, document, photograph, statement, ownership claim, location, or user-submitted information on the platform is accurate, complete, current, authentic, or legally valid.

B. NO GUARANTEE / NO WARRANTY

CivilCheck does not provide any guarantee, warranty, certification, or assurance regarding the ownership, title, legality, authenticity, accuracy, completeness, marketability, dispute-free status, transaction outcome, or future condition of any property, document, listing, information, report, user, professional, or service available through the platform. Without limiting the foregoing: property ownership is not guaranteed; clear title is not guaranteed; document authenticity is not absolutely guaranteed; user-provided information is not guaranteed; transaction success is not guaranteed; legal status is not guaranteed; absence of disputes is not guaranteed; and future outcomes are not guaranteed.

C. INDEPENDENT DUE DILIGENCE

You must conduct your own independent due diligence before making any purchase decision, payment, investment, agreement, property transfer, or legal decision in connection with anything accessed through CivilCheck. You should obtain qualified legal, property, financial, or tax advice where appropriate before relying on any information or report obtained through the platform.

D. PROPERTY VERIFICATION LIMITATIONS

CivilCheck cannot guarantee: clear title; undisputed ownership; complete document authenticity; the absence of hidden encumbrances; the absence of pending litigation unless specifically identified within the performed scope; the absence of government or registration issues; the absence of boundary disputes; the absence of family or inheritance disputes; the physical condition of a property; possession; future authority or court decisions; or the successful completion of any transaction. Every verification service is limited to its agreed scope and is not exhaustive.

E. VERIFICATION REPORT

A CivilCheck verification report is not a court judgment, government certificate, title certificate, legal opinion, or unconditional guarantee. A report reflects the agreed scope, the documents and information available at the time, the checks and records actually performed, and the professional assessment made at that time — nothing more.

F. USER-SUBMITTED CONTENT

You are responsible for the accuracy of any information or documents you upload or submit, including property details, ownership claims, documents, photographs, descriptions, contact details, and statements. You must not intentionally provide false or misleading information to CivilCheck, to any professional on the platform, or to any other user.

G. FRAUD, SCAMS AND USER SAFETY

CivilCheck does not guarantee that every user or listing on the platform is genuine. You must independently verify identity, ownership, title, original documents, government records, property location, the seller's or owner's authority to transact, and any payment, bank, or UPI details before proceeding. The following are strictly prohibited on CivilCheck: fake or forged documents, fake listings, impersonation, fake accounts, misleading property information, manipulation of the verification process, fake claims, refund abuse, payout fraud, review manipulation, unauthorized access to any account, and any other unlawful activity.

H. FRAUD WARNING

Be cautious of anyone who asks you to pay outside CivilCheck's official payment mechanisms, or who asks you to share an OTP, password, UPI PIN, card PIN, or banking password, or who asks you to install remote-access software, or who requests an unusual advance payment, or who asks you to pay into an unrelated personal account. CivilCheck will never ask you to share your password, OTP, UPI PIN, card PIN, or banking password. If you suspect fraud, please report it through CivilCheck's in-app Support feature.

I. THIRD-PARTY / PROFESSIONAL LIMITATION

Owners, Experts, Reporters, other professionals, and other users are independent participants on the CivilCheck platform. CivilCheck does not automatically guarantee their statements, conduct, performance, future actions, availability, or transaction behavior. Where an Expert performs a verification, the resulting report remains subject to the agreed scope and the information available to that Expert at the time.

J. 7-DAY CLAIM WINDOW

Once a verification report becomes available/unlocked, the buyer has 7 days from the backend-recorded completion time to review the report and submit a claim if they identify an issue or discrepancy with the verification service. The exact deadline recorded by CivilCheck's systems is authoritative. A claim submitted after this 7-day window may be rejected. Submitting a claim does not by itself mean a refund will be granted — a claim is reviewed according to the applicable process and the evidence provided, and the assigned Expert's payout may be frozen while an eligible claim is under review.

K. ACCEPTANCE

When a buyer accepts a completed verification report, or the 7-day claim window lapses without a claim, that acceptance is recorded by CivilCheck. Where the verification was performed by an Expert, this may make that Expert's payout eligible for processing under CivilCheck's settlement rules, and may trigger related notifications. Acceptance or expiry does not itself guarantee, and should not be read as promising, an instant payout.

L. EXPERT 30/70 SETTLEMENT

For an eligible Expert-performed verification, CivilCheck's platform settlement model allocates 30% of the verification fee to CivilCheck and 70% to the Expert. This is CivilCheck's settlement model for that transaction — it is not a guarantee of income, and it is not a guarantee of the volume or availability of future assignments. Payout timing remains subject to CivilCheck's applicable settlement rules, successful payment capture, the absence of an active claim, and the Expert's payout details being on file. Admin and SuperAdmin platform staff are not recipients of this Expert settlement under this model.

M. CLAIMS / REFUNDS

Claims are subject to eligibility and are reviewed by CivilCheck. Submitting a claim does not automatically guarantee a refund. While an eligible claim is under review, the related Expert payout may be frozen. Any refund approval is subject to CivilCheck's applicable policy, the review outcome, the rules of CivilCheck's payment provider, and applicable law.

N. PAYMENT / SETTLEMENT

Payments and settlements on CivilCheck may involve supported third-party payment providers. Please use CivilCheck's official in-app payment mechanisms for any payment connected to a CivilCheck service. Payments made directly to another user, professional, seller, owner, broker, or third party outside CivilCheck's official payment flow may not be protected by CivilCheck's platform payment mechanisms.

O. PLATFORM LIMITATION OF LIABILITY

To the maximum extent permitted by applicable law, CivilCheck shall not be liable for losses, disputes, inaccuracies, fraud, misconduct, unauthorized acts, third-party conduct, user-submitted information, property defects, title disputes, document authenticity issues, transaction failures, service interruptions, or other outcomes that are outside CivilCheck's reasonable control or that arise from the actions or information of users, professionals, third parties, external authorities, or service providers. Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited under applicable law.

P. PROFESSIONAL RESPONSIBILITY

The professional assigned to a piece of work (an Expert performing a verification, for example) is responsible for performing that service according to its agreed scope. CivilCheck does not guarantee a professional's conclusions beyond the platform's stated scope and processes for that service.

Q. PLATFORM AVAILABILITY

CivilCheck aims to maintain reliable service but does not guarantee uninterrupted or error-free availability. Service may be disrupted by maintenance, network issues, cloud-provider outages, payment-provider outages, email-provider outages, other third-party service failures, government restrictions, cyber incidents, force majeure, or other events outside CivilCheck's reasonable control. This section remains subject to applicable law.

R. USER RESPONSIBILITY

You are responsible for the information you submit, the documents you upload, the decisions you make, the payments you authorize, the transactions you enter into, your own independent verification of anything you rely on, the security of your account, and your compliance with applicable law.

S. ACCOUNT SECURITY

You must protect your password, OTPs, login credentials, and devices. Please report any suspected unauthorized access to your account through CivilCheck's in-app Support feature as soon as possible.

T. PROHIBITED ACTIVITIES

The following are prohibited on CivilCheck: fraud; forgery; impersonation; fake listings; fake documents; providing misleading information; unauthorized access to any account or system; abuse of the payment system; abuse of the claim or refund process; manipulation of Expert payouts; manipulation of the verification process; manipulation of reviews; any unlawful activity; and any attempt to bypass CivilCheck's platform security.

U. ACCOUNT SUSPENSION

CivilCheck may suspend, restrict, or disable an account or content in accordance with its applicable policies and law, where appropriate — for example, where these Terms have been violated or fraud is suspected.

V. PRIVACY

Please also review CivilCheck's Privacy Policy, which explains what information CivilCheck collects and how it is used. This Terms document does not repeat that content.

W. CHANGES TO TERMS

These Terms may be updated from time to time. When CivilCheck publishes a materially updated version, you may be required to review and accept the updated Terms before continuing to use the relevant CivilCheck services.

X. GOVERNING LAW

CivilCheck's specific governing law and jurisdiction have not yet been finalized in this document and are flagged here for legal/business review before this document is relied on in production. Nothing above should be read as excluding or limiting any protection that applicable law does not permit CivilCheck to exclude or limit.

Y. CONTACT

If you have a question about these Terms, or need to report suspected fraud, a safety concern, or any other issue, please use CivilCheck's in-app Support feature.`

const PRIVACY_BODY = `This Privacy Policy explains what information CivilCheck collects through its buyer, partner, and admin applications, why it is collected, and how it is used. It should be read together with CivilCheck's Terms & Conditions.

INFORMATION WE COLLECT

Account information: name, phone number, email address, and password (stored as a secure hash, never in plain text).

Profile information: city, state, address, and profile photo, where you choose to provide them.

Verification/KYC information (Partners): profession, licence number, years of experience, bank account and IFSC details for payout purposes, selfie, professional certificate, and identity document, where applicable to your partner role.

Property and listing information: property details, documents, photographs, and descriptions you or others submit for listings, properties, and verification requests.

Payment information: CivilCheck's payment provider (Razorpay) processes your payment details directly; CivilCheck does not store your card, UPI, or full bank account details on its own systems beyond what is needed to identify and reconcile a transaction and, for Experts, to process a payout via CivilCheck's payout provider.

Communications: verification-request messages, support tickets, notifications, and any other communication you send through the platform.

Device and usage information: push-notification tokens, and basic technical information the app needs to function (for example, to show you relevant properties or route notifications).

Location information: where a feature explicitly asks for it (for example, Property Discovery), CivilCheck uses your provided location only to power that feature.

HOW WE USE INFORMATION

To create and manage your account, verify your email/identity, and secure your login.

To operate the property listing, verification-marketplace, claim, and payout features you use.

To process payments and payouts through CivilCheck's payment and payout providers.

To send you transactional communications (for example: OTPs, verification-report updates, claim-deadline reminders, payout-status updates) by email, SMS, or push notification, and to send support-related communications.

To review KYC/professional documents for partner approval, and to investigate suspected fraud, abuse, or Terms violations.

To improve and maintain the reliability of the platform.

THIRD-PARTY SERVICE PROVIDERS

CivilCheck uses third-party providers to operate the platform, including: Razorpay (payments and, for Experts, payouts), Cloudinary (document/photo/video storage), Firebase (authentication and push notifications), and Resend (transactional email). These providers process the data necessary to perform their function for CivilCheck and are not authorized to use your information for their own independent purposes.

DOCUMENT PRIVACY

KYC and identity documents (certificate, selfie, identity document) are stored privately and are only viewable via a short-lived, signed link generated for the document's owner or for an authorized admin reviewing that application — they are not publicly accessible. Property and listing photos/documents that are part of an approved listing are shown to users browsing the platform, consistent with the purpose of a public property listing.

DATA RETENTION

CivilCheck retains account and transaction information for as long as your account is active and as needed to meet legal, accounting, dispute-resolution, and fraud-prevention obligations.

YOUR CHOICES

You can update your profile information from within the app. You can control push-notification delivery from your device/app settings. If you would like your account reviewed, restricted, or removed, please contact CivilCheck through the in-app Support feature.

CHILDREN

CivilCheck is not directed at children and is not intended for use by anyone not permitted to enter into a binding agreement under applicable law.

CHANGES TO THIS POLICY

This Privacy Policy may be updated from time to time. Material updates may require you to review and accept the updated Terms & Conditions and Privacy Policy before continuing to use the relevant CivilCheck services.

CONTACT

If you have a question about this Privacy Policy or your information, please use CivilCheck's in-app Support feature.

NOTE FOR REVIEW: this Privacy Policy describes CivilCheck's actual current data practices as implemented in the product. It has not yet been reviewed by a lawyer and does not yet state a specific governing law/regulatory framework (e.g. India's DPDP Act) — flagged here for legal/business review before this document is relied on in production.`

async function upsertLegalDoc(key: string, title: string, body: string) {
  const existing = await prisma.disclaimer.findUnique({ where: { key } })
  if (existing) {
    if (existing.body === body) {
      console.log(`Disclaimer "${key}" already up to date (version ${existing.version}) — leaving it as-is.`)
      return
    }
    const updated = await prisma.disclaimer.update({
      where: { key },
      data: { title, body, version: { increment: 1 } },
    })
    console.log(`Updated Disclaimer "${key}" to version ${updated.version}.`)
    return
  }
  const created = await prisma.disclaimer.create({
    data: { key, title, body, version: 1, active: true },
  })
  console.log(`Created Disclaimer "${key}" (id ${created.id}, version ${created.version}).`)
}

async function main() {
  await upsertLegalDoc(TERMS_KEY, 'Terms & Conditions', TERMS_BODY)
  await upsertLegalDoc(PRIVACY_KEY, 'Privacy Policy', PRIVACY_BODY)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
