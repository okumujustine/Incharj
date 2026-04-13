import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, ArrowRight, Zap } from 'lucide-react'
import { orgsService } from '../services/orgs'
import { useAuthStore } from '../stores/authStore'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import type { OrgSummary } from '../types'

export function OrgSelectorPage() {
  const navigate = useNavigate()
  const setCurrentOrg = useAuthStore((s) => s.setCurrentOrg)
  const user = useAuthStore((s) => s.user)

  const orgsQuery = useQuery({
    queryKey: ['user-orgs'],
    queryFn: orgsService.listMine,
  })

  if (orgsQuery.isLoading) return <PageSpinner />

  function handleSelectOrg(org: OrgSummary) {
    // OrgSummary doesn't have logo_url/created_at — cast to what the store expects
    setCurrentOrg({ ...org, logo_url: null, created_at: '' })
    navigate('/search')
  }

  const orgs = orgsQuery.data ?? []

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-7 h-7 bg-accent/20 border border-accent/30 rounded flex items-center justify-center">
            <Zap size={14} className="text-accent" />
          </div>
          <span className="text-base font-semibold text-text-primary tracking-tight">
            Incharj
          </span>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-text-primary">
            Welcome{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Select an organization to continue
          </p>
        </div>

        {orgs.length === 0 ? (
          <div className="bg-bg-surface border border-border rounded">
            <EmptyState
              icon={<Building2 size={36} />}
              title="No organizations"
              description="You are not a member of any organization. Ask your admin to invite you."
            />
          </div>
        ) : (
          <>
            <div className="bg-bg-surface border border-border rounded divide-y divide-border mb-4">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSelectOrg(org)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-bg-elevated transition-colors group"
                >
                  <div className="w-9 h-9 rounded bg-accent/15 border border-accent/20 flex items-center justify-center text-accent text-sm font-semibold flex-shrink-0">
                    {org.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium text-text-primary">{org.name}</p>
                    <p className="text-xs text-text-muted font-mono">{org.slug}</p>
                  </div>
                  <div className="flex items-center gap-2 text-text-muted group-hover:text-text-secondary transition-colors">
                    <span className="text-xs capitalize bg-bg-overlay border border-border rounded px-2 py-0.5">
                      {org.role}
                    </span>
                    {org.plan && (
                      <span className="text-xs capitalize bg-bg-overlay border border-border rounded px-2 py-0.5">
                        {org.plan}
                      </span>
                    )}
                    <ArrowRight size={14} />
                  </div>
                </button>
              ))}
            </div>

          </>
        )}
      </div>
    </div>
  )
}
