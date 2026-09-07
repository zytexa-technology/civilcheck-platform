# Where the security fixes stand — plain-language update

**Prepared:** 2026-08-04 (updated same day — all ten audit findings now addressed)
**For:** non-technical readers — this is a companion to `qa-audit-2026-08-03.md`, which has the full technical detail. Item numbers below match that document.

This document tracks progress against the pre-launch QA audit from the day before. Nothing here needs a technical background to read.

---

## Scorecard

| Status | Count |
| --- | --- |
| ✅ Fixed and confirmed working | 9 |
| 🟡 Code done, can't be fully verified yet | 2 |
| ⚪ Low priority, not urgent | 7 |

All ten findings from the original audit have code written, tested where testable, and pushed. Nothing is waiting on a decision from you anymore.

---

## ✅ Fixed and confirmed working

### 1. Fake login codes
Anyone who knew a customer's phone number could log into their account using the same fixed 6-digit code (`123456`) — there was no real verification happening at all, for buyers or sellers. Replaced with a real, randomly generated code that expires in 5 minutes and can only be used once. Confirmed end-to-end with automated tests.

### 2. Sellers acting outside their registered role
The app has two kinds of sellers — **Property Owners**, who list their own property, and **Experts** (lawyers/engineers), who do paid verification work. The screens kept these separated, but our servers didn't — someone could bypass the screen and act as the other type. Now blocked on the server, not just hidden in the screen. Confirmed working.

### 3. "Sign Out" didn't actually sign you out
In the admin panel, clicking "Sign Out" only cleared your browser — it never told our servers the session had ended. A copied login token would keep working even after you signed out. Sign Out now properly ends the session on our servers too. You confirmed this works in the browser.

### 4. Sellers could enter any bank details
The screen where sellers update their payout bank account had no checks at all — a malformed or fake account number could be silently saved and used for their next weekly payout. Now properly validated, and the seller gets a notification any time their bank details change, so they'd notice if someone else changed them. Confirmed by the full automated test run.

### 5. Listing prices could be changed to anything
Listings are supposed to be priced between ₹99–4999. That limit was enforced when a listing is first created, but not when a seller edits it afterward. Now enforced both times. Confirmed by the full automated test run.

### 6. Property owners could skip required documents
The "Add Property" form shows 8 documents as mandatory (Sale Deed, Registry, Khata, etc.) but never actually required them before letting someone submit. Now both the screen and the server require all 8 before a property can go to review. Confirmed by the full automated test run.

### 9. Error messages were revealing internal details
When something went wrong on a few screens, the message sent back to the user's browser included internal technical detail (database error codes and similar) instead of a plain message. Cleaned up — users now see a simple, safe message, while the real detail is only logged for our own engineers. Confirmed by the full automated test run.

### 10. A rare timing bug could create duplicate refunds
If two admins happened to submit a refund for the exact same purchase within the same split second, both could go through, creating a duplicate entry. Now physically prevented at the database level — no money-safety issue existed before this either way, but it kept creating cleanup work. Confirmed by the full automated test run.

### Admin panel readability (not from the original audit — a separate request)
You flagged that numbers were hard to read and text felt low-contrast in the admin panel. Switched the whole app to one consistent, more legible font (Poppins), and fixed a label/caption color that was, by an objective readability standard, too dim against the dark background — it was used in over 200 places across the app. You confirmed this looks right.

---

## 🟡 Code done, can't be fully verified yet

Both of these are written, reviewed, and pass every automated check available — but neither can be *fully* proven working without something outside plain code review.

### 7. The buyer app could silently point at the wrong server after a release build
Fixed: if a required setting is ever left blank when we build the app for release, it now shows a clear "this app isn't set up correctly" screen instead of every feature silently failing with no explanation. Also added the missing configuration file for setting the server address per build type. **Update:** simulated the release-build condition locally (production JS mode, setting left blank) and confirmed the screen appears exactly as intended, then confirmed normal use is unaffected once the setting is present. **Why it's still not fully "confirmed":** that was a local stand-in for a release build, not an actual one produced through our real build pipeline — that step is still outstanding.

### 8. Push notifications don't work yet in the buyer app
Fixed on the app side: the code that asks permission, registers the device, and shows/handles notifications is all written and wired up. **Why it's not "confirmed," and won't be yet:** actually receiving a push notification needs a few account-level things that don't exist for this project yet — a Firebase project, permanent app identifiers, and (for iPhone specifically) an extra certificate uploaded to that Firebase project. None of that is code — it's setup you'll need to do (or grant access for) before this can be tested for real, on either Android or iPhone. Happy to walk through exactly what's needed whenever you're ready.

---

## ⚪ Low priority — not urgent

These were all flagged in the original audit as minor, cosmetic, or "worth knowing about" rather than launch-blocking. Nothing here is a security issue.

- The seller-facing app has no automated code-quality checks running on it at all, unlike the other three apps — worth adding at some point.
- Admin login sessions are stored in a way that's fine today (no known way to exploit it), but would matter more if a different kind of bug were ever found later.
- Buyers who log in via phone/Google/Apple (instead of the standard flow) aren't recognized as "already paid" on one specific report screen — a display bug, not a security issue.
- A small timing glitch on one property list screen: switching filters quickly on a slow connection can briefly show a stale, incorrect result.
- Two dashboard pages show "trend" arrows (▲ 8%) that aren't based on any real data — leftover placeholder from an earlier version.
- Some unused, dead code lying around (an old unused import, a couple of no-op functions from an earlier design) — clutter, not risk.
- The buyer app has no document-verification (KYC) flow at all — this is very likely intentional, since KYC is a seller-side concept in the current product, but worth an explicit "yes, that's correct" from you rather than an assumption.

---

*Full technical detail for every item above is in `docs/qa-audit-2026-08-03.md`. Ask any time if you want more detail on a specific line.*
