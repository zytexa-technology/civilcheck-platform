// ─────────────────────────────────────────────────────────────────────────────
// PDF generation (Day 6) — report certificates, GST invoices, seller payout
// statements. Built with pdf-lib, which draws pages directly with no headless
// browser involved — Puppeteer's bundled Chromium was ruled out for Railway's
// memory footprint. Layout here is manual text placement, not markup.
// ─────────────────────────────────────────────────────────────────────────────
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, degrees } from 'pdf-lib'
import { round2 } from './payment.service.js'

const PAGE_WIDTH = 595.28 // A4, points
const PAGE_HEIGHT = 841.89
const MARGIN = 50

interface Doc {
  pdf: PDFDocument
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  y: number
}

interface LineOpts {
  size?: number
  bold?: boolean
  gap?: number
  color?: [number, number, number]
}

async function newDoc(): Promise<Doc> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  return { pdf, page, font, bold, y: PAGE_HEIGHT - MARGIN }
}

// Draws one line of text and advances the cursor, starting a fresh page first
// if the line wouldn't fit — so a long transaction list (payout statement)
// paginates instead of silently running off the bottom of the page.
function line(doc: Doc, text: string, opts: LineOpts = {}): void {
  const size = opts.size ?? 11
  const gap = opts.gap ?? size + 8

  if (doc.y < MARGIN + gap) {
    doc.page = doc.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    doc.y = PAGE_HEIGHT - MARGIN
  }

  const font = opts.bold ? doc.bold : doc.font
  const [r, g, b] = opts.color ?? [0, 0, 0]
  doc.page.drawText(text, { x: MARGIN, y: doc.y, size, font, color: rgb(r, g, b) })
  doc.y -= gap
}

function spacer(doc: Doc, amount = 12): void {
  doc.y -= amount
}

function heading(doc: Doc, text: string): void {
  line(doc, text, { size: 18, bold: true, gap: 26 })
}

function subheading(doc: Doc, text: string): void {
  line(doc, text, { size: 13, bold: true, gap: 20 })
}

function rule(doc: Doc): void {
  if (doc.y < MARGIN + 16) {
    doc.page = doc.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    doc.y = PAGE_HEIGHT - MARGIN
  }
  doc.page.drawLine({
    start: { x: MARGIN, y: doc.y },
    end: { x: PAGE_WIDTH - MARGIN, y: doc.y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  })
  doc.y -= 16
}

// Diagonal translucent overlay on the current page only — a certificate that
// spills to a second page (long case details) only carries the watermark on
// its first page, which is where the identifying content lives anyway.
function drawWatermark(doc: Doc, text: string): void {
  doc.page.drawText(text, {
    x: PAGE_WIDTH / 2 - 170,
    y: PAGE_HEIGHT / 2,
    size: 26,
    font: doc.bold,
    color: rgb(0.85, 0.85, 0.85),
    opacity: 0.4,
    rotate: degrees(-40),
  })
}

const inr = (n: number) => `Rs. ${n.toFixed(2)}`
const dateStr = (d: Date) => d.toDateString()

// ─────────────────────────────────────────────────────────────────────────────
// REPORT CERTIFICATE — GET /api/purchases/:id/certificate
// ─────────────────────────────────────────────────────────────────────────────
export interface ReportCertificateInput {
  purchase: { id: string; createdAt: Date }
  listing: {
    address: string
    city: string
    tehsil: string
    propertyType: string
    khasraNumber: string | null
    surveyNumber: string | null
    riskBadge: string
    caseExists: boolean
    caseType: string | null
    caseStatus: string | null
    courtName: string | null
    partiesInvolved: string | null
    loanDefault: boolean
    lenderName: string | null
    researchDate: Date
  }
  buyerName: string
}

export async function generateReportCertificate(input: ReportCertificateInput): Promise<Uint8Array> {
  const { purchase, listing, buyerName } = input
  const doc = await newDoc()

  heading(doc, 'CivilCheck Property Verification Report')
  line(doc, `Certificate ID: ${purchase.id}`, { size: 9, color: [0.4, 0.4, 0.4] })
  line(doc, `Issued to ${buyerName} on ${dateStr(purchase.createdAt)}`, { size: 9, color: [0.4, 0.4, 0.4] })
  spacer(doc, 6)
  rule(doc)

  subheading(doc, 'Property')
  line(doc, `Address: ${listing.address}`)
  line(doc, `City / Tehsil: ${listing.city} / ${listing.tehsil}`)
  line(doc, `Property Type: ${listing.propertyType}`)
  if (listing.khasraNumber) line(doc, `Khasra Number: ${listing.khasraNumber}`)
  if (listing.surveyNumber) line(doc, `Survey Number: ${listing.surveyNumber}`)
  spacer(doc)

  subheading(doc, 'Risk Assessment')
  line(doc, `Risk Badge: ${listing.riskBadge}`, { bold: true })
  line(doc, `Research Date: ${dateStr(listing.researchDate)}`)
  spacer(doc)

  subheading(doc, 'Litigation & Loan Status')
  line(doc, `Court Case Exists: ${listing.caseExists ? 'Yes' : 'No'}`)
  if (listing.caseExists) {
    if (listing.caseType) line(doc, `Case Type: ${listing.caseType}`)
    if (listing.caseStatus) line(doc, `Case Status: ${listing.caseStatus}`)
    if (listing.courtName) line(doc, `Court: ${listing.courtName}`)
    if (listing.partiesInvolved) line(doc, `Parties Involved: ${listing.partiesInvolved}`)
  }
  line(doc, `Loan Default: ${listing.loanDefault ? 'Yes' : 'No'}`)
  if (listing.loanDefault && listing.lenderName) line(doc, `Lender: ${listing.lenderName}`)

  drawWatermark(doc, `Licensed to ${buyerName}`)

  spacer(doc, 24)
  rule(doc)
  line(doc, 'Generated by CivilCheck for the exclusive use of the named buyer.', {
    size: 8,
    color: [0.5, 0.5, 0.5],
  })
  line(doc, 'Unauthorized redistribution of this report is prohibited.', {
    size: 8,
    color: [0.5, 0.5, 0.5],
  })

  return doc.pdf.save()
}

// ─────────────────────────────────────────────────────────────────────────────
// GST INVOICE — GET /api/purchases/:id/invoice
//
// GST is charged on CivilCheck's own platform service fee (platformCut), not
// the full report price — the report price already includes the seller's
// share, which is the seller's own income, not CivilCheck's. platformCut is
// treated as GST-EXCLUSIVE (18% added on top); this is a business-policy
// reading, not something specified elsewhere in the codebase — flagged in the
// Day 6 roadmap notes for confirmation.
// ─────────────────────────────────────────────────────────────────────────────
const GST_RATE = 0.18

export interface InvoiceInput {
  purchase: { id: string; platformCut: number; createdAt: Date }
  listing: { address: string; city: string }
  buyerName: string
  buyerPhone: string
}

export async function generateInvoice(input: InvoiceInput): Promise<Uint8Array> {
  const { purchase, listing, buyerName, buyerPhone } = input
  const gst = round2(purchase.platformCut * GST_RATE)
  const total = round2(purchase.platformCut + gst)

  const doc = await newDoc()
  heading(doc, 'Tax Invoice')
  line(doc, 'CivilCheck Technologies', { bold: true })
  line(doc, `Invoice No: INV-${purchase.id.slice(-8).toUpperCase()}`, { size: 9, color: [0.4, 0.4, 0.4] })
  line(doc, `Invoice Date: ${dateStr(purchase.createdAt)}`, { size: 9, color: [0.4, 0.4, 0.4] })
  spacer(doc, 6)
  rule(doc)

  subheading(doc, 'Billed To')
  line(doc, buyerName)
  line(doc, buyerPhone)
  spacer(doc)

  subheading(doc, 'Property Report')
  line(doc, `${listing.address}, ${listing.city}`)
  spacer(doc)

  rule(doc)
  line(doc, 'Platform Service Fee', { bold: true })
  line(doc, `Amount: ${inr(purchase.platformCut)}`)
  line(doc, `GST @ 18%: ${inr(gst)}`)
  line(doc, `Total: ${inr(total)}`, { bold: true })
  spacer(doc, 16)
  rule(doc)
  line(doc, "GST is computed on CivilCheck's platform service fee only, not the full report", {
    size: 8,
    color: [0.5, 0.5, 0.5],
  })
  line(doc, "price — the report price also includes the seller's own share.", {
    size: 8,
    color: [0.5, 0.5, 0.5],
  })

  return doc.pdf.save()
}

// ─────────────────────────────────────────────────────────────────────────────
// SELLER PAYOUT STATEMENT — GET /api/seller/earnings/statement/pdf
// Renders the same TDS/gross/net numbers computeEarningsStatement() serves as
// JSON, so the PDF and the in-app statement can never disagree.
// ─────────────────────────────────────────────────────────────────────────────
export interface PayoutStatementInput {
  sellerName: string | null | undefined
  sellerPhone: string | null | undefined
  sellerPan: string | null | undefined
  period: { from: Date; to: Date }
  summary: {
    grossEarnings: number
    tdsDeducted: number
    netPayable: number
    totalTransactions: number
    tdsApplicable: boolean
  }
  transactions: { date: Date; property: string; city: string; grossAmount: number }[]
}

export async function generatePayoutStatement(input: PayoutStatementInput): Promise<Uint8Array> {
  const doc = await newDoc()

  heading(doc, 'Seller Payout Statement')
  line(doc, input.sellerName ?? 'Unnamed Seller', { bold: true })
  if (input.sellerPhone) line(doc, input.sellerPhone, { size: 9, color: [0.4, 0.4, 0.4] })
  if (input.sellerPan) line(doc, `PAN: ${input.sellerPan}`, { size: 9, color: [0.4, 0.4, 0.4] })
  line(doc, `Period: ${dateStr(input.period.from)} to ${dateStr(input.period.to)}`, {
    size: 9,
    color: [0.4, 0.4, 0.4],
  })
  spacer(doc, 6)
  rule(doc)

  subheading(doc, 'Summary')
  line(doc, `Gross Earnings: ${inr(input.summary.grossEarnings)}`)
  line(
    doc,
    input.summary.tdsApplicable
      ? `TDS Deducted (10%): ${inr(input.summary.tdsDeducted)}`
      : 'TDS Deducted: Not applicable (below Rs. 30,000/year threshold)'
  )
  line(doc, `Net Payable: ${inr(input.summary.netPayable)}`, { bold: true })
  line(doc, `Total Transactions: ${input.summary.totalTransactions}`)
  spacer(doc)

  subheading(doc, 'Transactions')
  if (input.transactions.length === 0) {
    line(doc, 'No transactions in this period.', { size: 9, color: [0.5, 0.5, 0.5] })
  }
  for (const t of input.transactions) {
    line(doc, `${dateStr(t.date)}  ${t.property}, ${t.city}  ${inr(t.grossAmount)}`, { size: 9 })
  }

  return doc.pdf.save()
}
