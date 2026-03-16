import React from 'react'
import { Outlet, useParams, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '../../stores/authStore'

export function AppLayout() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const currentOrg = useAuthStore((s) => s.currentOrg)

  const slug = orgSlug ?? currentOrg?.slug

  if (!slug) {
    return <Navigate to="/orgs" replace />
  }

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden">
      <Sidebar orgSlug={slug} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
