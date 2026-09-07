import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { API_URL } from '../config/env'
import { getToken } from '../api/storage'

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated PDF downloads — the report certificate and the GST invoice.
//
// Both endpoints stream bytes behind a Bearer token, so they cannot simply be
// handed to WebBrowser/Linking: there is no way to attach a header to those.
// The file is downloaded to the cache directory with the auth header attached,
// then handed to the OS share sheet, which is also what makes it viewable on
// Android (a raw file:// URI would be rejected without a FileProvider).
//
// This uses the SDK 54 File/Paths API (expo-file-system), not the deprecated
// FileSystem.downloadAsync from expo-file-system/legacy.
// ─────────────────────────────────────────────────────────────────────────────

export class PdfError extends Error {}

/**
 * Download an authenticated PDF and open the share/preview sheet for it.
 *
 * @param path   API path relative to /api — e.g. "/purchases/abc/certificate".
 * @param filename Name the file is saved and shared under.
 */
export async function openAuthenticatedPdf(path: string, filename: string): Promise<void> {
  const token = await getToken()
  if (!token) {
    throw new PdfError('Your session has expired. Please log in again.')
  }

  const available = await Sharing.isAvailableAsync()
  if (!available) {
    throw new PdfError('Opening documents is not supported on this device.')
  }

  const destination = new File(Paths.cache, filename)

  // Only the URI is carried out of the try block — the download and the share
  // fail for different reasons and must not be reported as the same thing.
  let uri: string
  try {
    const downloaded = await File.downloadFileAsync(`${API_URL}${path}`, destination, {
      headers: { Authorization: `Bearer ${token}` },
      // Re-opening the same certificate would otherwise reject with
      // DestinationAlreadyExists against the copy left by the previous open.
      idempotent: true,
    })
    uri = downloaded.uri
  } catch (error) {
    // A non-2xx response rejects with UnableToDownload and no file is created,
    // so there is nothing to clean up here.
    throw new PdfError(
      error instanceof Error && error.message
        ? `Download failed: ${error.message}`
        : 'The document could not be downloaded.',
    )
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: filename,
  })
}

/** Watermarked report certificate for an unlocked purchase. */
export function openCertificate(purchaseId: string): Promise<void> {
  return openAuthenticatedPdf(
    `/purchases/${purchaseId}/certificate`,
    `civilcheck-certificate-${purchaseId}.pdf`,
  )
}

/** GST invoice for the platform fee on a purchase. */
export function openInvoice(purchaseId: string): Promise<void> {
  return openAuthenticatedPdf(
    `/purchases/${purchaseId}/invoice`,
    `civilcheck-invoice-${purchaseId}.pdf`,
  )
}
