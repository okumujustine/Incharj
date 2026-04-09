import React from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '../../stores/authStore'

export function AppLayout() {
  const currentOrg = useAuthStore((s) => s.currentOrg)

  if (!currentOrg) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
