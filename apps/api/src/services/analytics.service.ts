// ─────────────────────────────────────────────────────────────────────────────
// Alert-subscription analytics (PDF 5.6).
//
// Everything derivable from the Alert table ships here. One headline metric
// still cannot be:
//
//   · monthlyRenewalRate — a renewal is a Razorpay `subscription.charged`
//     event on the separate Subscription model, which has no renewal ledger
//     populated yet — a different gap from subscriberChurnRate below.
//
// subscriberChurnRate was blocked the same way until Day 4 added
// `Alert.cancelledAt` — now wired: churn = cancellations this month ÷
// subscriptions that were active at the start of this month.
//
// monthlyRenewalRate returns null rather than 0: a dashboard must be able to
// tell "nobody renewed" apart from "we cannot compute this yet", and 0 reads
// as the former.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js'

const TREND_MONTHS = 6

export interface SubscriptionMetrics {
  activeSubscriptions: number
  inactiveSubscriptions: number
  totalSubscriptions: number
  uniqueActiveSubscribers: number
  averageSubscriptionsPerSubscriber: number
  newThisMonth: number
  newLastMonth: number
  monthOverMonthGrowthPct: number | null
  trend: Array<{ month: string; newSubscriptions: number }>
  monthlyRenewalRate: number | null
  subscriberChurnRate: number | null
  // Surfaced so a dashboard can render "—" with a tooltip instead of an
  // unexplained blank where the two null metrics sit.
  pendingMetricsNote: string
}

export async function getSubscriptionMetrics(now: Date = new Date()): Promise<SubscriptionMetrics> {
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [
    active,
    inactive,
    total,
    distinctSubscribers,
    newThisMonth,
    newLastMonth,
    cancelledThisMonth,
    activeAtStartOfMonth,
  ] = await Promise.all([
      prisma.alert.count({ where: { active: true } }),
      prisma.alert.count({ where: { active: false } }),
      prisma.alert.count(),
      // One buyer can watch several properties, so "subscribers" and
      // "subscriptions" are different numbers and the dashboard needs both.
      prisma.alert.findMany({
        where: { active: true },
        distinct: ['userId'],
        select: { userId: true },
      }),
      prisma.alert.count({ where: { createdAt: { gte: startOfThisMonth } } }),
      prisma.alert.count({
        where: { createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
      }),
      // Cancelled during this month
      prisma.alert.count({ where: { cancelledAt: { gte: startOfThisMonth } } }),
      // Existed before this month began, and was still active at that moment
      // — either never cancelled, or cancelled sometime during/after this
      // month started.
      prisma.alert.count({
        where: {
          createdAt: { lt: startOfThisMonth },
          OR: [{ cancelledAt: null }, { cancelledAt: { gte: startOfThisMonth } }],
        },
      }),
    ])

  const uniqueActiveSubscribers = distinctSubscribers.length

  const trend: Array<{ month: string; newSubscriptions: number }> = []
  for (let i = TREND_MONTHS - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)

    trend.push({
      month: start.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
      newSubscriptions: await prisma.alert.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
    })
  }

  return {
    activeSubscriptions: active,
    inactiveSubscriptions: inactive,
    totalSubscriptions: total,
    uniqueActiveSubscribers,
    averageSubscriptionsPerSubscriber:
      uniqueActiveSubscribers > 0
        ? Number((active / uniqueActiveSubscribers).toFixed(2))
        : 0,
    newThisMonth,
    newLastMonth,
    // Undefined rather than 0% when last month had no subscriptions — dividing
    // by zero would report either Infinity or a meaningless 100%.
    monthOverMonthGrowthPct:
      newLastMonth > 0
        ? Number((((newThisMonth - newLastMonth) / newLastMonth) * 100).toFixed(1))
        : null,
    trend,

    // Still blocked on Razorpay subscription renewal data — see file header.
    monthlyRenewalRate: null,
    subscriberChurnRate:
      activeAtStartOfMonth > 0
        ? Number(((cancelledThisMonth / activeAtStartOfMonth) * 100).toFixed(1))
        : null,
    pendingMetricsNote:
      'monthlyRenewalRate needs Razorpay subscription renewal records, which are not ' +
      'populated yet. It is null, not zero, until then.',
  }
}
