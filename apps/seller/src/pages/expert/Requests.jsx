// ─────────────────────────────────────────────────────────────────────────
//  expert/Requests.jsx  —  saari assigned requests
//  File #17 of the redesign.  RAKHNA: src/pages/expert/Requests.jsx
//
//  Table + accept/reject/upload logic Dashboard file se reuse hota hai.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { PageHead } from '../../components/ui'
import { ExpertRequestsTable, expertActions } from './Dashboard'

export default function ExpertRequests({ go }) {
  useEffect(() => { expertActions.load() }, [])

  return (
    <>
      <PageHead title="Requests" subtitle="Assigned, Pending, Active aur Completed — Super Admin dwara assign." />
      {/* `go` lets the submit modal send an expert to New Listing when they
          have no listing to attach yet. */}
      <ExpertRequestsTable go={go} />
    </>
  )
}