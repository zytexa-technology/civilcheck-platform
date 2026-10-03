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
  // Previously absent — with props starting as [], the "koi property nahi"
  // empty state rendered for the whole fetch duration, falsely telling a
  // partner with real properties that they have none until the request
  // resolved. `loading` lets that empty state show only once we actually
  // know the list is empty.
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoadError(false)
    setLoading(true)
    // 'deleted' filter ke liye backend ko status bhejo (warna deleted skip hote hain)
    getMyProperties(filter === 'deleted' ? { status: 'DELETED' } : {})
      .then((data) => setProps((data?.properties || []).map(propertyFromApi)))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
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
      {loading ? (
        <div className="prop-grid">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="prop" style={{ padding: 0 }}>
              <div className="skel" style={{ height: 120, borderRadius: 0 }} />
              <div style={{ padding: 15 }}>
                <div className="skel" style={{ height: 14, width: '70%', marginBottom: 10 }} />
                <div className="skel" style={{ height: 12, width: '45%' }} />
              </div>
            </Card>
          ))}
        </div>
      ) : visible.length ? (
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