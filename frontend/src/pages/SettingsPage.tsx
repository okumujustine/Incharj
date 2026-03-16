import React, { useState } from 'react'
import { NavLink, Outlet, useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Trash2, UserMinus, Mail, Crown } from 'lucide-react'
import { orgsService } from '../services/orgs'
import { useAuth } from '../hooks/useAuth'
import { TopBar } from '../components/layout/TopBar'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { RoleBadge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'

export function SettingsLayout() {
  const { orgSlug } = useParams<{ orgSlug: string }>()

  const tabs = [
    { to: `/${orgSlug}/settings`, label: 'General', end: true },
    { to: `/${orgSlug}/settings/members`, label: 'Members' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar crumbs={[{ label: orgSlug ?? '' }, { label: 'Settings' }]} />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto p-6">
          {/* Tab nav */}
          <div className="flex items-center gap-0.5 border-b border-border mb-6">
            {tabs.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'px-4 py-2 text-sm border-b-2 -mb-px transition-colors',
                    isActive
                      ? 'border-accent text-text-primary font-medium'
                      : 'border-transparent text-text-muted hover:text-text-secondary',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            ))}
          </div>

          <Outlet />
        </div>
      </div>
    </div>
  )
}

export function GeneralSettingsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const orgQuery = useQuery({
    queryKey: ['org', orgSlug],
    queryFn: () => orgsService.get(orgSlug!),
    enabled: !!orgSlug,
  })

  const [orgName, setOrgName] = useState('')
  const [nameError, setNameError] = useState('')
  const [nameSuccess, setNameSuccess] = useState(false)

  React.useEffect(() => {
    if (orgQuery.data) setOrgName(orgQuery.data.name)
  }, [orgQuery.data])

  const updateOrg = useMutation({
    mutationFn: (name: string) => orgsService.update(orgSlug!, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', orgSlug] })
      setNameSuccess(true)
      setTimeout(() => setNameSuccess(false), 2000)
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Update failed'
      setNameError(msg)
    },
  })

  const deleteOrg = useMutation({
    mutationFn: () => orgsService.delete(orgSlug!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] })
      navigate('/orgs')
    },
  })

  if (orgQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size={20} />
      </div>
    )
  }

  const org = orgQuery.data

  return (
    <div className="flex flex-col gap-6">
      {/* Org details */}
      <div className="bg-bg-surface border border-border rounded">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Organization details</h2>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <Input
            label="Organization name"
            value={orgName}
            onChange={(e) => {
              setOrgName(e.target.value)
              setNameError('')
              setNameSuccess(false)
            }}
            error={nameError}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              URL slug
            </label>
            <div className="flex items-center h-9 bg-bg-elevated border border-border rounded px-3">
              <span className="text-sm text-text-muted font-mono">{org?.slug}</span>
            </div>
            <p className="text-xs text-text-muted">Slug cannot be changed after creation.</p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              isLoading={updateOrg.isPending}
              onClick={() => updateOrg.mutate(orgName)}
              disabled={!orgName.trim() || orgName === org?.name}
            >
              Save changes
            </Button>
            {nameSuccess && (
              <span className="text-xs text-success">Saved!</span>
            )}
          </div>
        </div>
      </div>

      {/* Plan */}
      <div className="bg-bg-surface border border-border rounded">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Plan</h2>
        </div>
        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-text-primary font-medium capitalize">
              {org?.plan ?? 'Free'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">Current subscription plan</p>
          </div>
          <Button variant="outline" size="sm">
            Upgrade
          </Button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-bg-surface border border-error/20 rounded">
        <div className="px-5 py-4 border-b border-error/20">
          <h2 className="text-sm font-semibold text-error">Danger zone</h2>
        </div>
        <div className="p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">Delete organization</p>
            <p className="text-xs text-text-muted mt-0.5">
              Permanently delete this organization, all connectors, and indexed documents.
              This cannot be undone.
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            isLoading={deleteOrg.isPending}
            leftIcon={<Trash2 size={12} />}
            className="whitespace-nowrap flex-shrink-0"
            onClick={() => {
              if (
                confirm(
                  `Delete "${org?.name}"? All data will be permanently deleted. Type the org name to confirm.`
                )
              ) {
                deleteOrg.mutate()
              }
            }}
          >
            Delete org
          </Button>
        </div>
      </div>
    </div>
  )
}

export function MembersSettingsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const membersQuery = useQuery({
    queryKey: ['org-members', orgSlug],
    queryFn: () => orgsService.listMembers(orgSlug!),
    enabled: !!orgSlug,
  })

  const invitationsQuery = useQuery({
    queryKey: ['org-invitations', orgSlug],
    queryFn: () => orgsService.listInvitations(orgSlug!),
    enabled: !!orgSlug,
  })

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  const inviteMutation = useMutation({
    mutationFn: () =>
      orgsService.invite(orgSlug!, { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgSlug] })
      setInviteSuccess(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      setTimeout(() => setInviteSuccess(''), 3000)
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to send invitation'
      setInviteError(msg)
    },
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) => orgsService.removeMember(orgSlug!, userId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['org-members', orgSlug] }),
  })

  const revokeInvitation = useMutation({
    mutationFn: (invId: string) => orgsService.revokeInvitation(orgSlug!, invId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgSlug] }),
  })

  const members = membersQuery.data ?? []
  const invitations = (invitationsQuery.data ?? []).filter((inv) => !inv.accepted)

  return (
    <div className="flex flex-col gap-6">
      {/* Invite */}
      <div className="bg-bg-surface border border-border rounded">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Invite member</h2>
        </div>
        <div className="p-5">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Email address"
                type="email"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value)
                  setInviteError('')
                }}
                placeholder="colleague@company.com"
                leftElement={<Mail size={13} />}
                error={inviteError}
              />
            </div>
            <Select
              label="Role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member' | 'viewer')}
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'member', label: 'Member' },
                { value: 'viewer', label: 'Viewer' },
              ]}
            />
            <Button
              variant="primary"
              size="md"
              isLoading={inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
              disabled={!inviteEmail.trim()}
            >
              Invite
            </Button>
          </div>
          {inviteSuccess && (
            <p className="text-xs text-success mt-2">{inviteSuccess}</p>
          )}
        </div>
      </div>

      {/* Members table */}
      <div className="bg-bg-surface border border-border rounded">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            Members{' '}
            <span className="text-text-muted font-mono text-xs ml-1">
              ({members.length})
            </span>
          </h2>
        </div>
        {membersQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : members.length === 0 ? (
          <EmptyState icon={<Users size={28} />} title="No members yet" />
        ) : (
          <div className="divide-y divide-border">
            {members.map((membership) => {
              const isCurrentUser = membership.user?.id === user?.id
              const isOwner = membership.role === 'owner'
              return (
                <div
                  key={membership.id}
                  className="flex items-center gap-4 px-5 py-3"
                >
                  <div className="w-8 h-8 rounded bg-bg-elevated border border-border flex items-center justify-center text-xs font-medium text-text-muted flex-shrink-0">
                    {membership.user?.full_name?.charAt(0).toUpperCase() ??
                      membership.user?.email?.charAt(0).toUpperCase() ??
                      '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-text-primary truncate">
                        {membership.user?.full_name ?? membership.user?.email ?? 'Unknown'}
                      </p>
                      {isCurrentUser && (
                        <span className="text-2xs text-text-muted">(you)</span>
                      )}
                    </div>
                    {membership.user?.full_name && (
                      <p className="text-xs text-text-muted truncate">
                        {membership.user.email}
                      </p>
                    )}
                  </div>
                  <RoleBadge role={membership.role} />
                  {!isOwner && !isCurrentUser && (
                    <button
                      onClick={() => removeMember.mutate(membership.user_id)}
                      className="text-text-muted hover:text-error transition-colors ml-2"
                      title="Remove member"
                    >
                      <UserMinus size={14} />
                    </button>
                  )}
                  {isOwner && (
                    <Crown size={14} className="text-warning ml-2 flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="bg-bg-surface border border-border rounded">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-text-primary">
              Pending invitations
            </h2>
          </div>
          <div className="divide-y divide-border">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-3">
                <Mail size={14} className="text-text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{inv.email}</p>
                  <p className="text-xs text-text-muted">
                    Expires{' '}
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <RoleBadge role={inv.role} />
                <button
                  onClick={() => revokeInvitation.mutate(inv.id)}
                  className="text-text-muted hover:text-error transition-colors ml-2"
                  title="Revoke invitation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Default export for the settings page (redirects to general tab)
export function SettingsPage() {
  return null // handled by SettingsLayout + outlet
}
