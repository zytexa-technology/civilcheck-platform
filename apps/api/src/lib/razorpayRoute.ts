// ─────────────────────────────────────────────────────────────────────────────
// Razorpay Route (marketplace Linked Accounts) — adapter INTERFACE only.
//
// Route is a DIFFERENT product from both razorpay.ts (Checkout Orders) and
// razorpayPayouts.ts (RazorpayX Payouts, already integrated and used by the
// weekly settlement — see settlement.service.ts). Route lets a single
// Checkout payment be split, in real time, between a "linked account" (the
// professional) and the platform at the moment the payment captures — the
// literal "marketplace" flow.
//
// THIS ADAPTER IS NOT CONFIGURED AND IS NOT USABLE TODAY. There is no
// RAZORPAY_ROUTE_ACCOUNT_ID (or equivalent) anywhere in this codebase's env
// files, and Route requires the Razorpay account itself to be provisioned
// as a marketplace/aggregator account on Razorpay's side (a business
// verification step done in the Razorpay Dashboard, not something any
// amount of code here can turn on). Calling any function below returns a
// structured "not configured" result rather than throwing a generic error —
// callers (payout.service.ts) use that to fall back to the real, working
// mechanism instead: RazorpayX Payouts.
//
// Why this file exists at all, given it does nothing yet: Phase 4B's brief
// asks for "a clean Razorpay Route adapter/interface" as the foundation for
// a future upgrade — real-time split-at-capture — without faking that
// capability today. The shape of every function here matches Razorpay's
// actual Route API (https://razorpay.com/docs/route/) so that turning this
// on later is a matter of filling in the HTTP calls and env vars, not
// redesigning the interface or the callers.
//
// EXACT CONFIGURATION REQUIRED BEFORE THIS ADAPTER CAN GO LIVE:
//   1. Razorpay must approve the account for Route (Dashboard → Account &
//      Settings → Route, or via your Razorpay account manager) — this is a
//      business/compliance review on Razorpay's side, not a code change.
//   2. RAZORPAY_ROUTE_ENABLED=true (or equivalent) in the API's .env, so
//      isRouteConfigured() below can report true — currently always false.
//   3. Each professional needs a Razorpay Linked Account created via
//      POST /v1/accounts (KYC documents, bank details) — the resulting
//      account id is what Seller.razorpayLinkedAccountId (Phase 4B schema
//      addition) stores.
//   4. Orders created for verification-marketplace payments would need a
//      `transfers` array pointing at the linked account, added at order
//      creation time (lib/razorpay.ts's createOrder) — not implemented, since
//      doing so before step 1-3 exist would silently do nothing on Razorpay's
//      side, or fail, either of which is worse than not pretending to try.
// ─────────────────────────────────────────────────────────────────────────────
import logger from './logger.js'

export function isRouteConfigured(): boolean {
  // No live account is provisioned for Route today — see the header above.
  // Kept as a function (not a bare constant) so flipping this on later is a
  // one-line change once RAZORPAY_ROUTE_ENABLED actually means something.
  return process.env.RAZORPAY_ROUTE_ENABLED === 'true'
}

export interface RouteNotConfiguredResult {
  configured: false
  reason: string
}

export interface RouteLinkedAccount {
  configured: true
  id: string
  status: string
}

export type CreateLinkedAccountResult = RouteLinkedAccount | RouteNotConfiguredResult

// Would create a Razorpay Linked Account for a professional
// (POST /v1/accounts) and return its id for storage on
// Seller.razorpayLinkedAccountId. Never called from anywhere yet — payout
// onboarding today only sets payoutEligibilityStatus, via the existing
// bank-details fields (Seller.bankAccount/ifsc), for RazorpayX Payouts.
export async function createLinkedAccount(_sellerId: string): Promise<CreateLinkedAccountResult> {
  if (!isRouteConfigured()) {
    logger.warn('[razorpay-route] createLinkedAccount called but Route is not configured')
    return { configured: false, reason: 'Razorpay Route is not configured for this account' }
  }
  // Real implementation would POST to /v1/accounts here once step 1-2 above
  // are done. Deliberately unimplemented rather than a mock — a mock Linked
  // Account id would look real enough to be mistaken for one that can
  // actually receive a transfer, which it cannot.
  throw new Error('Razorpay Route is configured but createLinkedAccount is not yet implemented')
}

export interface RouteTransferResult {
  configured: true
  id: string
  status: string
}

export type CreateTransferResult = RouteTransferResult | RouteNotConfiguredResult

// Would create a Route transfer (POST /v1/transfers, or a `transfers[]`
// entry on the originating order) moving a professional's share to their
// Linked Account. See payout.service.ts — the actual payout path uses
// RazorpayX Payouts instead, precisely because this returns "not configured".
export async function createTransfer(_params: {
  linkedAccountId: string
  amountPaise: number
  referenceId: string
}): Promise<CreateTransferResult> {
  if (!isRouteConfigured()) {
    logger.warn('[razorpay-route] createTransfer called but Route is not configured')
    return { configured: false, reason: 'Razorpay Route is not configured for this account' }
  }
  throw new Error('Razorpay Route is configured but createTransfer is not yet implemented')
}

export interface RouteTransferStatus {
  configured: true
  id: string
  status: string
  onHold: boolean
}

export type FetchTransferStatusResult = RouteTransferStatus | RouteNotConfiguredResult

// Would reconcile a transfer's status (GET /v1/transfers/:id) — the Route
// equivalent of payout.service.ts's webhook-driven RazorpayX confirmation.
export async function fetchTransferStatus(_transferId: string): Promise<FetchTransferStatusResult> {
  if (!isRouteConfigured()) {
    return { configured: false, reason: 'Razorpay Route is not configured for this account' }
  }
  throw new Error('Razorpay Route is configured but fetchTransferStatus is not yet implemented')
}
