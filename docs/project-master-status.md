# CivilCheck — Project Master Document

**A plain-language summary of what has been built, what's left before launch, and what's planned next.**

**Prepared:** 7 August 2026
**Audience:** Non-technical stakeholders (founders, client, business team)
**Product by:** Zytexa Technology LLP

---

## 1. What CivilCheck is, in one paragraph

CivilCheck is an online marketplace that helps property buyers in India find out — quickly and affordably — whether a property has a hidden legal problem such as a pending court case, a loan default, or a disputed title. Instead of hiring a lawyer for ₹5,000–50,000 and spending weeks visiting government offices, a buyer pays ₹99–4,999 and gets a clear report prepared by a verified local expert. The company itself does not do the verification — it connects three groups of people and keeps the marketplace trustworthy.

---

## 2. Who uses it — the three sides of the marketplace

| Who | What they do | What they get |
|---|---|---|
| **Buyer** | Searches for a property, sees a free "is there a case? yes/no" answer, then pays to unlock the full report | Peace of mind before spending their life savings |
| **Partner / Expert (the "Seller")** | A verified lawyer, civil engineer or local official who uploads verified property information | Earns a commission (60–70%) on every report sold |
| **Admin (Zytexa staff)** | Approves experts, quality-checks reports, handles refunds and payments | Keeps the platform honest and trustworthy |

There is also a **free "Case Exists?" check** on every property — a yes/no answer anyone can see without paying. This is the hook that turns visitors into paying customers.

---

## 3. What has been built so far — the honest status

**The short version: the core product is built and works. It is not yet live to the public, because a few real-world accounts and business decisions are still pending (details in Section 4).**

### 3.1 The four apps that make up CivilCheck

All four are built and working together:

1. **The engine (backend / API)** — the "brain" that stores all data, handles payments, and enforces every rule. This is the most complete part.
2. **The Admin Panel** — the internal website Zytexa staff use to run the platform.
3. **The Partner Panel** — the website property owners and experts use to sign up and manage their work.
4. **The Buyer App** — the mobile phone app buyers use to search and buy reports.

### 3.2 Features that are done and working

- **Sign-up and login** for all three types of users, using secure one-time codes sent by SMS (buyers and experts) and password + a second security step for staff.
- **Expert onboarding with identity checks (KYC)** — experts submit documents and bank details; staff approve or reject them.
- **Uploading and approving property reports** — every report is reviewed by staff before a buyer can see it.
- **The free "Case Exists?" check** and paid report unlocking.
- **Payments** — buyers pay online; the money is automatically split between the platform and the expert (e.g. 60% to the expert). Refunds are supported.
- **Automatic risk labels** — every property is colour-coded **GREEN** (clean), **AMBER** (caution), or **RED** (serious problem).
- **Quality control** — staff randomly audit reports; experts who submit fake information are penalised, suspended, and buyers are automatically refunded.
- **Expert reward tiers** — Bronze → Silver → Gold → Platinum, with better-performing experts earning a higher share.
- **Custom research requests** — buyers can ask for a report on a property not yet in the system, and the platform assigns a nearby qualified expert.
- **Alerts, notifications, invoices, tax statements, and weekly payouts** to experts.
- **Security and record-keeping** — a full audit trail of every staff action, strict access controls so each person can only do their own job, and protection against common fraud and abuse.

### 3.3 How thoroughly it has been checked

- A full **pre-production quality audit** was done on **3 August 2026**. It found ten issues, including one serious login-security gap. **All ten were fixed and verified by 4 August 2026.**
- The engine is written to a high code-quality standard and passes its automated tests.

---

## 4. What is still needed before going live

None of these are missing features — they are real-world setup steps and business decisions, not more building.

### 4.1 Real accounts and credentials (setup, not coding)

The system was built so that plugging in real accounts is the only remaining step — no code changes needed. Still to be connected:

- **Payment accounts** (Razorpay) for real money.
- **SMS and email accounts** (Msg91, Resend) for real notifications.
- **Document storage** (Cloudinary) for identity-document uploads (manually reviewed by a SUPER_ADMIN — no third-party identity-verification API is used).
- **Mobile push notifications** (Firebase) — needs a real project and, for iPhones, an Apple certificate.

### 4.2 Automatic deployment is currently switched off

The system that would automatically publish updates to the live servers exists but has been **deliberately turned off** for now. It needs to be switched back on and connected to real hosting accounts before launch.

### 4.3 Business decisions still open

A few policy questions need a final decision from the business, for example:

- The exact tax (GST/TDS) treatment on invoices and expert payouts.
- Some fine print on penalties and expert rating rules.

These are one-line changes once decided — they are waiting on a decision, not on development.

---

## 5. What's planned next — the "CivilCheck Partner" expansion

A newer product specification (dated 5 August 2026) proposes a **significant expansion** of the platform. This has been fully analysed and documented, but **not yet started**. The main changes:

| Planned change | What it means in plain terms |
|---|---|
| **Rename "Seller" to "CivilCheck Partner"** | New, friendlier branding across the platform |
| **A third type of partner: "Property Reporter"** | A brand-new role — people who contribute property-market news and content and earn reward points/cash for it |
| **One account, many roles** | Today a person is locked into one role; the new model lets one person be a buyer, owner, and expert at once, switching without logging out |
| **Faster approvals** | Property owners and reporters get approved instantly; only experts still need manual review |
| **Google Sign-In everywhere** | Log in with Google, alongside the existing SMS code |
| **A rewards wallet** | Points, leaderboards, and cash/voucher redemption for reporters |
| **Stronger permissions and financial record-keeping** | Behind-the-scenes upgrades for security and money-tracking as the platform grows |

There is also **one important question the client needs to answer**: whether expert reports should stay focused on **legal/case-history checks** (what's built today) or shift toward **physical/structural building inspections** (what the newer spec hints at). This decision affects how much of the expansion work is needed.

---

## 6. Timeline for the expansion

The client's expectation is that the **full expansion** must be delivered before final acceptance. Working solo and full-time, reusing everything already built, the complete expansion is estimated at **roughly 10 weeks (about 2.5 months)**, broken into stages that each produce something visible:

| Stage | Timing | What gets delivered |
|---|---|---|
| **1. Quick wins + decisions locked** | Weeks 1–2 | Google Sign-In, faster owner approvals, profile improvements, small fixes; the two open business questions get answered |
| **2. One account, many roles** | Weeks 2–4 | The foundation that lets a person hold multiple roles securely |
| **3. Partner portal + owner features** | Weeks 4–5 | The unified partner website and improved property dashboards |
| **4. Property Reporter module** | Weeks 5–8 | The biggest new piece — content contributions, rewards, wallet, and redemptions |
| **5. Expert upgrades + admin tools** | Weeks 8–9 | Better expert verification and staff approval tools |
| **6. Finishing + testing** | Weeks 9–10 | Notifications, accessibility, final polish, and a safety buffer |

**The client sees working progress from Week 2 onward — not a two-month wait for everything at once.**

> A note on this estimate: 10 weeks solo for the full scope is optimistic and assumes uninterrupted, full-time focus. If the scope grows, or the mobile-app technology decision changes, it will take longer. A comfortable buffer is already built into the final stage.

---

## 7. The bottom line

- **The core product is built, tested, and works.** It is not yet public only because real payment/SMS accounts and a few business decisions are still pending — not because features are missing.
- **Going live is mostly a setup exercise:** connect real accounts, switch deployment back on, finalise a few policies.
- **A large, well-understood expansion is planned** (the "CivilCheck Partner" module), fully documented and estimated at about **10 weeks** of focused work, delivered in visible stages.

---

*This is a plain-language summary for planning and stakeholder review. The detailed technical records are in `docs/roadmap.md` (day-by-day build log), `docs/changes-required-2026-08-05.md` (the expansion gap analysis and timeline), and `README.md` (the full technical overview).*
