// ─────────────────────────────────────────────────────────────────────────
//  owner/MyProperties.jsx  —  status filter  (REAL /seller/properties)
//  RAKHNA: src/pages/owner/MyProperties.jsx  (replace)
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { getMyProperties, deleteProperty } from '../../api/seller.api'
import { Card, PageHead, toast } from '../../components/ui'
import { PropTile, propertyFromApi } from './Dashboard'

const FILTERS = ['All', 'Approved', 'Pending', 'Draft', 'Rejected', 'Deleted']

export default function OwnerProperties() {
  const [props, setProps] = useState([])
  const [filter, setFilter] = useState('all')
  const [loadError, setLoadError] = useState(false)

  const load = () => {
    setLoadError(false)
    // 'deleted' filter ke liye backend ko status bhejo (warna deleted skip hote hain)
    getMyProperties(filter === 'deleted' ? { status: 'DELETED' } : {})
      .then((data) => setProps((data?.properties || []).map(propertyFromApi)))
      .catch(() => setLoadError(true))
  }

  useEffect(load, [filter])

  const handleDelete = async (id) => {
    try {
      await deleteProperty(id)
      setProps((list) => list.map((p) => (p.id === id ? { ...p, status: 'deleted' } : p)))
      toast('Property Deleted me move ho gayi')
    } catch (e) {
      toast(e.response?.data?.message || 'Delete nahi hua — dobara try karo')
    }
  }

  const handleUpdated = (updatedApi) => {
    const updated = propertyFromApi(updatedApi)
    setProps((list) => list.map((p) => (p.id === updated.id ? updated : p)))
  }

  const visible = filter === 'all'
    ? props.filter((p) => p.status !== 'deleted')
    : props.filter((p) => p.status === filter)

  return (
    <>
      <PageHead title="My Properties" subtitle="Draft, Pending, Approved, Rejected aur Deleted — sab ek jagah." />

      <div className="seg" style={{ marginBottom: 18 }}>
        {FILTERS.map((f) => {
          const val = f.toLowerCase()
          return (
            <button key={f} className={filter === val ? 'on' : ''} onClick={() => setFilter(val)}>{f}</button>
          )
        })}
      </div>

      {loadError && (
        <Card style={{ padding: '14px 18px', marginBottom: 16, borderColor: 'var(--danger)' }}>
          <p className="small dev" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 10 }}>
            Properties load nahi hui.
            <button className="btn btn-light btn-sm" onClick={load}>Retry</button>
          </p>
        </Card>
      )}
      {visible.length ? (
        <div className="prop-grid">
          {visible.map((p) => <PropTile key={p.id} p={p} onDelete={handleDelete} onUpdated={handleUpdated} />)}
        </div>
      ) : !loadError ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted dev">Is category me koi property nahi.</p>
        </Card>
      ) : null}
    </>
  )
}