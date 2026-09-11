import { useCallback, useEffect, useState } from 'react'
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { cancelAlert, getMyAlerts, subscribeAlert } from '../api/alert.api'
import { getPropertyById } from '../api/property.api'
import { getMyPurchases, unlockReport, verifyPurchase } from '../api/purchase.api'
import { useAuth } from '../context/AuthContext'
import { errorMessage, errorStatus } from '../lib/errors'
import { openCertificate, openInvoice, PdfError } from '../lib/pdf'
import { formatDate, formatRupees, humanize, riskBanner, sellerBadgeLong } from '../lib/format'
import { colors, radius, SCREEN_PADDING, spacing } from '../theme'
import { AuthRequiredSheet } from '../components/AuthRequiredSheet'
import { Button } from '../components/Button'
import { Card, DetailRow, InfoGrid, SectionCard } from '../components/Card'
import { Disclaimer } from '../components/Disclaimer'
import { FlagSheet } from '../components/FlagSheet'
import { LocationMapSection } from '../components/LocationMapSection'
import { MediaGallery } from '../components/MediaGallery'
import { Pill } from '../components/Pill'
import { ReviewSheet } from '../components/ReviewSheet'
import { Screen } from '../components/Screen'
import { VerifyPropertyCTA } from '../components/VerifyPropertyCTA'
import { HeaderIconButton, ScreenHeader } from '../components/ScreenHeader'
import { ErrorState, LoadingState } from '../components/States'
import { PaymentSheet } from './PaymentSheet'
import type {
  CheckoutOrder,
  CheckoutResult,
  PaidReportProperty,
  ReportProperty,
} from '../types/api'

const LOCKED_ROWS = [
  { label: 'Case number', value: 'CS/••••/••••' },
  { label: 'Case type', value: '••••••••••' },
  { label: 'Court', value: '••••••••••••' },
  { label: 'Status', value: '••••••••' },
  { label: 'Parties involved', value: '•••• vs ••••' },
  { label: 'Lender name', value: '••••••••' },
]

const UNLOCK_FEATURES = [
  'Case number, type & court name',
  'Parties involved & case status',
  'Loan default & lender details',
  'Supporting documents (PDFs)',
  "Expert's notes + downloadable certificate",
]

/**
 * One screen for both states of a report.
 *
 * This replaces the old /report and /unlocked pair, which each fetched the
 * property, discovered they were the wrong screen, and router.replace()'d to
 * the other — a redirect bounce on every open, and a loop risk whenever the two
 * disagreed. GET /api/properties/:id already reports `hasPurchased`, so the
 * branch belongs here.
 */
export function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { status } = useAuth()

  const [property, setProperty] = useState<ReportProperty | null>(null)
  const [hasPurchased, setHasPurchased] = useState(false)
  const [purchaseId, setPurchaseId] = useState<string | null>(null)
  const [alertId, setAlertId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [order, setOrder] = useState<CheckoutOrder | null>(null)
  const [razorpayKeyId, setRazorpayKeyId] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [startingOrder, setStartingOrder] = useState(false)

  const [showReview, setShowReview] = useState(false)
  const [showFlag, setShowFlag] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  // Guest browsing (Final Parity Batch, Task 1) — Unlock (payment) and Watch
  // are account-linked writes; Buyer Web's own PropertyDetail.tsx has no
  // equivalent gate on its Unlock button (it just lets a guest's request
  // 401), which this deliberately does NOT copy — "Guests must NOT be able
  // to ... make payments" is explicit and non-negotiable, so both actions
  // get the same AuthRequiredSheet treatment as Like/Save/Comment/Verify.
  const [authAction, setAuthAction] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) {
      setError('No property was selected.')
      return
    }

    setError('')

    try {
      const response = await getPropertyById(id)
      setProperty(response.property)
      setHasPurchased(response.hasPurchased)

      // The report screen only knows the listing id, but the certificate,
      // invoice, review and flag endpoints are all keyed on the Purchase. There
      // is no endpoint to look one up by listing, so the buyer's purchases are
      // fetched and matched locally.
      if (response.hasPurchased) {
        try {
          const purchases = await getMyPurchases()
          setPurchaseId(purchases.purchases.find((p) => p.listingId === id)?.id ?? null)
        } catch {
          // Non-fatal: the report still renders, the extra actions just stay off.
        }
      }

      // Guest browsing (Final Parity Batch, Task 1) — this screen is now
      // public (see app/_layout.tsx's PUBLIC_CONTENT_ROUTES), so a guest has
      // no watch state to fetch and no token to fetch it with; skipping
      // avoids a pointless 401 on every guest page load.
      if (status === 'authenticated') {
        try {
          const alerts = await getMyAlerts()
          setAlertId(alerts.alerts.find((a) => a.property.id === id)?.alertId ?? null)
        } catch {
          // Watch state is a nicety; treat an unknown state as "not watching".
        }
      }
    } catch (err) {
      setError(
        errorStatus(err) === 404
          ? 'This report is no longer available.'
          : errorMessage(err, "Couldn't load this report."),
      )
    }
  }, [id, status])

  useEffect(() => {
    void (async () => {
      await load()
      setLoading(false)
    })()
  }, [load])

  const handleUnlock = async () => {
    if (!id) return
    if (status !== 'authenticated') {
      setAuthAction('unlock this report')
      return
    }

    setStartingOrder(true)
    try {
      const response = await unlockReport(id)

      if (response.alreadyPurchased) {
        // Bought on another device, or the webhook landed before this screen
        // refreshed — just show the unlocked report.
        await load()
        return
      }

      setOrder(response.order)
      setRazorpayKeyId(response.razorpayKeyId)
      setShowPayment(true)
    } catch (err) {
      Alert.alert("Couldn't start payment", errorMessage(err))
    } finally {
      setStartingOrder(false)
    }
  }

  const handleToggleWatch = async () => {
    if (!id) return
    if (status !== 'authenticated') {
      setAuthAction('watch this property')
      return
    }

    setBusyAction('watch')
    try {
      if (alertId) {
        await cancelAlert(alertId)
        setAlertId(null)
        Alert.alert('Stopped watching', "You'll no longer get updates for this property.")
      } else {
        const response = await subscribeAlert(id)
        setAlertId(response.alertId)
        Alert.alert('Watching ✓', "We'll notify you if this property's case status changes.")
      }
    } catch (err) {
      // 409 means a watch already exists — the local state was simply stale.
      if (errorStatus(err) === 409) {
        await load()
      } else {
        Alert.alert('Notice', errorMessage(err))
      }
    } finally {
      setBusyAction(null)
    }
  }

  const handleDocument = async (kind: 'certificate' | 'invoice') => {
    if (!purchaseId) return

    setBusyAction(kind)
    try {
      await (kind === 'certificate' ? openCertificate(purchaseId) : openInvoice(purchaseId))
    } catch (err) {
      Alert.alert(
        kind === 'certificate' ? 'Certificate' : 'Invoice',
        err instanceof PdfError ? err.message : errorMessage(err),
      )
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Property report" />
        <LoadingState label="Loading report…" />
      </Screen>
    )
  }

  if (error || !property) {
    return (
      <Screen>
        <ScreenHeader title="Property report" />
        <ErrorState
          message={error || 'Report not found.'}
          onRetry={() => {
            setLoading(true)
            void (async () => {
              await load()
              setLoading(false)
            })()
          }}
        />
      </Screen>
    )
  }

  const banner = riskBanner(property.riskBadge)
  const watching = Boolean(alertId)

  return (
    <Screen
      scroll
      footer={
        hasPurchased ? null : (
          <View style={styles.unlockBar}>
            <Button
              label={`🔓 Unlock full report — ${formatRupees(property.price)}`}
              onPress={() => void handleUnlock()}
              loading={startingOrder}
              size="lg"
              block
            />
            <Text style={styles.unlockTrust}>🔒 Secure payment · Instant access</Text>
          </View>
        )
      }
    >
      <ScreenHeader
        title="Property report"
        subtitle={property.address}
        right={
          <HeaderIconButton
            glyph={watching ? '🔔' : '🔕'}
            onPress={() => void handleToggleWatch()}
            accessibilityLabel={watching ? 'Stop watching this property' : 'Watch this property'}
          />
        }
      />

      <View style={styles.bannerWrap}>
        <View
          style={[
            styles.banner,
            { backgroundColor: banner.bg, borderColor: banner.border },
          ]}
        >
          <Text style={styles.bannerIcon}>{banner.icon}</Text>
          <Text style={[styles.bannerLabel, { color: banner.color }]}>{banner.label}</Text>
          <Text style={styles.bannerDescription}>{banner.description}</Text>
        </View>
      </View>

      <Card>
        {hasPurchased ? (
          <View style={styles.unlockedTag}>
            <Text style={styles.unlockedTagText}>🔓 Unlocked</Text>
          </View>
        ) : null}
        <Text style={styles.propertyName}>{property.address}</Text>
        <Text style={styles.propertyMeta}>
          {sellerBadgeLong(property.sellerBadge)}
          {property.isPaid && property.sellerName ? ` · ${property.sellerName}` : ''}
          {property.isPaid && property.sellerAccuracyScore != null
            ? ` · ${property.sellerAccuracyScore}% accuracy`
            : ''}
        </Text>
        <InfoGrid
          items={[
            { label: 'Type', value: humanize(property.propertyType) },
            { label: 'Tehsil', value: property.tehsil || '—' },
            { label: 'City', value: property.city || '—' },
            { label: 'Researched on', value: formatDate(property.researchDate) },
            { label: 'Uploaded by', value: humanize(property.uploadedBy) },
          ]}
        />
      </Card>

      {property.images.length > 0 || property.videos.length > 0 ? (
        <MediaGallery images={property.images} videos={property.videos} />
      ) : null}

      <LocationMapSection
        latitude={property.latitude}
        longitude={property.longitude}
        mapUrl={property.mapUrl}
        address={property.address}
        locationLabel={[property.tehsil, property.city].filter(Boolean).join(', ') || 'the property'}
      />

      <Text style={styles.freeHeading}>✓ Free — shown to everyone</Text>
      <Card>
        <DetailRow label="Case exists?">
          <Text
            style={[
              styles.factValue,
              { color: property.caseExists ? colors.red : colors.green },
            ]}
          >
            {property.caseExists ? '⚠️ Yes — found on record' : '✅ None found'}
          </Text>
        </DetailRow>
        <DetailRow label="Risk badge">
          <Pill tone={banner} label={`${banner.icon} ${banner.label}`} />
        </DetailRow>
        <DetailRow label="Loan / mortgage flag" last>
          <Text
            style={[
              styles.factValue,
              { color: property.loanDefault ? colors.amber : colors.green },
            ]}
          >
            {property.loanDefault ? '⚠️ Yes' : 'No'}
          </Text>
        </DetailRow>
      </Card>

      {property.isPaid ? (
        <UnlockedSections
          property={property}
          purchaseId={purchaseId}
          busyAction={busyAction}
          watching={watching}
          onDocument={(kind) => void handleDocument(kind)}
          onReview={() => setShowReview(true)}
          onFlag={() => setShowFlag(true)}
          onToggleWatch={() => void handleToggleWatch()}
        />
      ) : (
        <LockedSection />
      )}

      {id ? <VerifyPropertyCTA source="LISTING" targetId={id} /> : null}

      <Disclaimer disclaimerKey="report" />

      <AuthRequiredSheet visible={authAction !== null} onClose={() => setAuthAction(null)} action={authAction ?? 'continue'} />

      <PaymentSheet
        visible={showPayment}
        onClose={() => setShowPayment(false)}
        order={order}
        razorpayKeyId={razorpayKeyId}
        priceLabel={formatRupees(property.price)}
        onPaid={async (result: CheckoutResult) => {
          await verifyPurchase(result)
        }}
        onSuccess={() => {
          setShowPayment(false)
          setLoading(true)
          void (async () => {
            await load()
            setLoading(false)
          })()
        }}
      />

      {purchaseId ? (
        <>
          <ReviewSheet
            visible={showReview}
            onClose={() => setShowReview(false)}
            purchaseId={purchaseId}
            onSubmitted={() => {
              setShowReview(false)
              Alert.alert('Thank you', 'Your review has been recorded.')
            }}
          />
          <FlagSheet
            visible={showFlag}
            onClose={() => setShowFlag(false)}
            purchaseId={purchaseId}
            onSubmitted={() => {
              setShowFlag(false)
              Alert.alert('Reported', 'An admin will review this report.')
            }}
          />
        </>
      ) : null}
    </Screen>
  )
}

// ─── LOCKED ──────────────────────────────────────────────────────────────────

function LockedSection() {
  return (
    <View style={styles.lockedWrap}>
      <View style={styles.lockedContent}>
        {LOCKED_ROWS.map((row) => (
          <View key={row.label} style={styles.lockedRow}>
            <Text style={styles.lockedKey}>{row.label}</Text>
            <Text style={styles.lockedValue}>{row.value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.lockOverlay}>
        <View style={styles.lockIcon}>
          <Text style={styles.lockGlyph}>🔒</Text>
        </View>
        <Text style={styles.lockTitle}>Unlock the full report</Text>
        <View style={styles.lockList}>
          {UNLOCK_FEATURES.map((feature) => (
            <Text key={feature} style={styles.lockItem}>
              <Text style={{ color: colors.gold }}>✓</Text> {feature}
            </Text>
          ))}
        </View>
      </View>
    </View>
  )
}

// ─── UNLOCKED ────────────────────────────────────────────────────────────────

interface UnlockedSectionsProps {
  property: PaidReportProperty
  purchaseId: string | null
  busyAction: string | null
  watching: boolean
  onDocument: (kind: 'certificate' | 'invoice') => void
  onReview: () => void
  onFlag: () => void
  onToggleWatch: () => void
}

function UnlockedSections({
  property,
  purchaseId,
  busyAction,
  watching,
  onDocument,
  onReview,
  onFlag,
  onToggleWatch,
}: UnlockedSectionsProps) {
  const caseDetails = [
    property.caseNumber ? { label: 'Case number', value: property.caseNumber } : null,
    property.caseType ? { label: 'Case type', value: humanize(property.caseType) } : null,
    property.courtName ? { label: 'Court', value: property.courtName } : null,
    property.caseStatus ? { label: 'Status', value: humanize(property.caseStatus) } : null,
    property.partiesInvolved
      ? { label: 'Parties involved', value: property.partiesInvolved }
      : null,
  ].filter((row): row is { label: string; value: string } => row !== null)

  return (
    <>
      {caseDetails.length > 0 ? (
        <SectionCard icon="⚖️" iconBackground={colors.redDim} title="Case details">
          {caseDetails.map((row, index) => (
            <DetailRow
              key={row.label}
              label={row.label}
              value={row.value}
              last={index === caseDetails.length - 1}
            />
          ))}
        </SectionCard>
      ) : null}

      <SectionCard icon="🏦" iconBackground={colors.amberDim} title="Financial encumbrances">
        <DetailRow
          label="Loan / mortgage flag"
          value={property.loanDefault ? '⚠️ Yes' : 'No'}
          valueColor={property.loanDefault ? colors.amber : colors.green}
          last={!property.lenderName}
        />
        {property.lenderName ? (
          <DetailRow label="Lender name" value={property.lenderName} last />
        ) : null}
      </SectionCard>

      {property.documents.length > 0 ? (
        <SectionCard icon="📎" iconBackground={colors.blueDim} title="Supporting documents">
          {property.documents.map((url, index) => (
            <TouchableOpacity
              key={url}
              style={[
                styles.documentRow,
                index === property.documents.length - 1 && styles.documentRowLast,
              ]}
              onPress={() => void Linking.openURL(url)}
              accessibilityRole="link"
            >
              <Text style={styles.documentIcon}>📄</Text>
              <View style={styles.grow}>
                <Text style={styles.documentName} numberOfLines={1}>
                  {url.split('/').pop() || `Document ${index + 1}`}
                </Text>
                <Text style={styles.documentHint}>Tap to open</Text>
              </View>
              <Text style={styles.documentGlyph}>↗</Text>
            </TouchableOpacity>
          ))}
        </SectionCard>
      ) : null}

      {property.sellerNotes ? (
        <SectionCard icon="✍️" iconBackground={colors.goldDim} title="Expert's note">
          <Text style={styles.expertNote}>&ldquo;{property.sellerNotes}&rdquo;</Text>
        </SectionCard>
      ) : null}

      {property.sellerContact ? (
        <SectionCard icon="📞" iconBackground={colors.greenDim} title="Contact the expert">
          <TouchableOpacity
            onPress={() => void Linking.openURL(`tel:${property.sellerContact}`)}
            accessibilityRole="link"
          >
            <DetailRow
              label="Phone"
              value={property.sellerContact}
              valueColor={colors.green}
              last
            />
          </TouchableOpacity>
        </SectionCard>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="📜 Certificate"
          variant="secondary"
          onPress={() => onDocument('certificate')}
          loading={busyAction === 'certificate'}
          disabled={!purchaseId}
          style={styles.actionButton}
        />
        <Button
          label="🧾 GST invoice"
          variant="secondary"
          onPress={() => onDocument('invoice')}
          loading={busyAction === 'invoice'}
          disabled={!purchaseId}
          style={styles.actionButton}
        />
      </View>

      <View style={styles.actions}>
        <Button
          label={watching ? '🔔 Watching' : '🔔 Watch updates'}
          variant="secondary"
          onPress={onToggleWatch}
          loading={busyAction === 'watch'}
          style={styles.actionButton}
        />
        <Button
          label="⭐ Rate report"
          variant="secondary"
          onPress={onReview}
          disabled={!purchaseId}
          style={styles.actionButton}
        />
      </View>

      {purchaseId ? (
        <View style={styles.actions}>
          <Button
            label="⚠️ Report a problem with this report"
            variant="ghost"
            onPress={onFlag}
            style={styles.actionButton}
          />
        </View>
      ) : null}
    </>
  )
}


const styles = StyleSheet.create({
  grow: { flex: 1 },
  bannerWrap: { paddingHorizontal: SCREEN_PADDING, paddingBottom: spacing.md },
  banner: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  bannerIcon: { fontSize: 42, marginBottom: spacing.sm },
  bannerLabel: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  bannerDescription: {
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 17,
    textAlign: 'center',
    maxWidth: 280,
  },
  unlockedTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.greenDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  unlockedTagText: { fontSize: 10, fontWeight: '700', color: colors.green },
  propertyName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  propertyMeta: { fontSize: 10.5, color: colors.muted },
  freeHeading: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.green,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginHorizontal: SCREEN_PADDING,
    marginBottom: spacing.sm,
  },
  factValue: { fontSize: 12.5, fontWeight: '600' },
  lockedWrap: {
    marginHorizontal: SCREEN_PADDING,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  lockedContent: { padding: spacing.lg, opacity: 0.35 },
  lockedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lockedKey: { fontSize: 12.5, color: colors.muted },
  lockedValue: { fontSize: 12.5, fontWeight: '600', color: colors.text },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  lockIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.goldDim,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  lockGlyph: { fontSize: 22 },
  lockTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  lockList: { alignSelf: 'stretch' },
  lockItem: { fontSize: 10.5, color: colors.muted, lineHeight: 19 },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  documentRowLast: { borderBottomWidth: 0 },
  documentIcon: { fontSize: 18 },
  documentName: { fontSize: 12, fontWeight: '600', color: colors.text },
  documentHint: { fontSize: 10, color: colors.muted, marginTop: 2 },
  documentGlyph: { fontSize: 15, color: colors.gold },
  expertNote: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 19,
    fontStyle: 'italic',
    paddingVertical: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: SCREEN_PADDING,
    marginBottom: spacing.sm,
  },
  actionButton: { flex: 1 },
  unlockBar: { paddingHorizontal: SCREEN_PADDING },
  unlockTrust: {
    textAlign: 'center',
    fontSize: 10,
    color: colors.muted,
    marginTop: 9,
  },
})
