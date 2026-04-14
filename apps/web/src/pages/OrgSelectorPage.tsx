import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, ArrowRight } from 'lucide-react'
import { orgsService } from '../services/orgs'
import { useAuthStore } from '../stores/authStore'
import { IncharjLogo } from '../components/ui/IncharjLogo'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import type { OrgSummary, OrgRole } from '../types'

const ROLE_STYLES: Record<OrgRole, string> = {
  owner:  'bg-accent/10 text-accent border-accent/20',
  admin:  'bg-warning/10 text-warning border-warning/20',
  member: 'bg-bg-overlay text-text-secondary border-border',
  viewer: 'bg-bg-overlay text-text-muted border-border',
}

export function OrgSelectorPage() {
  const navigate = useNavigate()
  const setCurrentOrg = useAuthStore((s) => s.setCurrentOrg)
  const user = useAuthStore((s) => s.user)

  const orgsQuery = useQuery({
    queryKey: ['user-orgs'],
    queryFn: orgsService.listMine,
  })

  if (orgsQuery.isLoading) return <PageSpinner />

  if (orgsQuery.isError) return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <p className="text-sm text-error">Failed to load organizations. Please refresh and try again.</p>
    </div>
  )

  function handleSelectOrg(org: OrgSummary) {
    setCurrentOrg(org)
    navigate('/search')
  }

  const orgs = orgsQuery.data ?? []

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md animate-fade-up">

        {/* Brand */}
        <div className="mb-12">
          <IncharjLogo size={26} />
        </div>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
            {user?.full_name ? `Hello, ${user.full_name.split(' ')[0]}` : 'Choose a workspace'}
          </h1>
          <p className="text-sm text-text-muted mt-1.5">
            Select an organization to continue
          </p>
        </div>

        {orgs.length === 0 ? (
          <div className="bg-bg-surface border border-border rounded-lg shadow-sm">
            <EmptyState
              icon={<Building2 size={32} className="text-text-muted" />}
              title="No organizations"
              description="You are not a member of any organization. Ask your admin to invite you."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {orgs.map((org, i) => (
              <button
                key={org.id}
                onClick={() => handleSelectOrg(org)}
                className="animate-fade-up group w-full flex items-center gap-4 px-4 py-3.5 bg-bg-surface border border-border rounded-lg hover:border-accent/40 hover:shadow-sm transition-all text-left"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-sm font-semibold flex-shrink-0 group-hover:bg-accent/15 transition-colors">
                  {org.name.slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{org.name}</p>
                  <p className="text-xs text-text-muted font-mono truncate">{org.slug}</p>
                </div>

                {/* Badges + arrow */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {org.plan && (
                    <span className="text-xs capitalize border rounded px-2 py-0.5 font-medium bg-bg-overlay text-text-secondary border-border">
                      {org.plan}
                    </span>
                  )}
                  <span className={`text-xs capitalize border rounded px-2 py-0.5 font-medium ${ROLE_STYLES[org.role]}`}>
                    {org.role}
                  </span>
                  <ArrowRight size={13} className="text-text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
