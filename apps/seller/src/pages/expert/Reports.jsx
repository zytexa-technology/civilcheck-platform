// ─────────────────────────────────────────────────────────────────────────
//  expert/Reports.jsx  —  submit kiye gaye reports
//  File #18 of the redesign.  RAKHNA: src/pages/expert/Reports.jsx
//
//  Submitted/completed/approved/rejected/refunded requests — real history
//  from GET /seller/special-requests (shared store se), so this survives a
//  page reload instead of only reflecting the current tab's in-memory state.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { Card, Chip, PageHead } from '../../components/ui'
import { useExpertStore, expertActions, STATUS_CHIP } from './Dashboard'

const DONE_STATUSES = ['completed', 'approved', 'rejected', 'refunded']

export default function ExpertReports() {
  const { requests } = useExpertStore()
  useEffect(() => { expertActions.load() }, [])

  const done = requests.filter((r) => DONE_STATUSES.includes(r.status))

  return (
    <>
      <PageHead title="Reports" subtitle="Aapke submit kiye gaye reports." />

      {done.length ? (
        <Card style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>{['Report', 'Type', 'Buyer', 'Fee', 'Status'].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {done.map((r) => {
                const st = STATUS_CHIP[r.status] || STATUS_CHIP.completed
                return (
                  <tr key={r.id}>
                    <td><b className="dev">{r.title}</b></td>
                    <td>{r.type}</td>
                    <td>{r.buyer}</td>
                    <td>₹{Number(r.fee).toLocaleString('en-IN')}</td>
                    <td>
                      <Chip tone={st[0]}>{st[1]}</Chip>
                      {r.status === 'rejected' && r.adminNote && (
                        <div className="xs muted" style={{ marginTop: 4 }}>{r.adminNote}</div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted dev">Abhi koi report submit nahi hui.</p>
        </Card>
      )}
    </>
  )
}