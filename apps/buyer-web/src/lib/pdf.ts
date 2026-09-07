import client from '../api/client'
import { errorMessage } from './errors'

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated PDF download — the web equivalent of apps/buyer's
// lib/pdf.ts (which used expo-file-system + expo-sharing). A browser has no
// filesystem to write into, so the pattern here is simpler: fetch the bytes
// through the authenticated axios client (so the Bearer token attaches),
// turn them into a Blob, and trigger a normal browser download via a
// temporary <a download> link.
// ─────────────────────────────────────────────────────────────────────────────

export async function downloadAuthenticatedPdf(path: string, filename: string): Promise<void> {
  try {
    const response = await client.get(path, { responseType: 'blob' })
    const blob = new Blob([response.data], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (err) {
    throw new Error(errorMessage(err, 'Could not download the PDF. Please try again.'), { cause: err })
  }
}
