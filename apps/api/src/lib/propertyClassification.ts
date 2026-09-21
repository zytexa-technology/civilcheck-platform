// Single source of truth for the Clear / Disputed property classification.
//
// The seller (Expert listing / Owner property) declares propertyStatus
// (CLEAR | DISPUTED) and, when DISPUTED, a disputeType. Those two fields are the ONLY
// source of the listing's visible alert (clients show CLEAR=green, DISPUTED=red). There is
// no risk-badge calculation anywhere and no yellow state.
import type { DisputeType, PropertyClassification } from '@prisma/client'

export interface Classification {
  propertyStatus: PropertyClassification | null
  disputeType: DisputeType | null
}

export class ClassificationError extends Error {}

// Applies an update's (validated) classification fields to what is stored.
//   - neither field sent            => unchanged
//   - propertyStatus CLEAR          => disputeType cleared (null)
//   - propertyStatus DISPUTED       => disputeType required
// The zod schema already enforces the combinations; this re-checks so the rule
// holds for any caller (defence in depth, DB CHECK constraint is the last line).
export function applyClassificationUpdate(
  existing: Classification,
  body: { propertyStatus?: PropertyClassification; disputeType?: DisputeType | null }
): Classification {
  if (body.propertyStatus === undefined) {
    if (body.disputeType) throw new ClassificationError('propertyStatus is required when disputeType is provided')
    return existing
  }
  if (body.propertyStatus === 'CLEAR') {
    if (body.disputeType) throw new ClassificationError('disputeType must not be set when the property is CLEAR')
    return { propertyStatus: 'CLEAR', disputeType: null }
  }
  if (!body.disputeType) throw new ClassificationError('disputeType is required when the property is DISPUTED')
  return { propertyStatus: 'DISPUTED', disputeType: body.disputeType }
}
