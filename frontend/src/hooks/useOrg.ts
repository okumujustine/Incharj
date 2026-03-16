import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { orgsService } from '../services/orgs'
import { useAuthStore } from '../stores/authStore'

export function useOrg() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const setCurrentOrg = useAuthStore((s) => s.setCurrentOrg)
  const queryClient = useQueryClient()

  const orgQuery = useQuery({
    queryKey: ['org', orgSlug],
    queryFn: () => orgsService.get(orgSlug!),
    enabled: !!orgSlug,
    staleTime: 5 * 60 * 1000,
    select: (org) => {
      setCurrentOrg(org)
      return org
    },
  })

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

  const removeMember = useMutation({
    mutationFn: (userId: string) => orgsService.removeMember(orgSlug!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgSlug] })
    },
  })

  const inviteMember = useMutation({
    mutationFn: (payload: { email: string; role: 'admin' | 'member' | 'viewer' }) =>
      orgsService.invite(orgSlug!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgSlug] })
    },
  })

  const revokeInvitation = useMutation({
    mutationFn: (invitationId: string) =>
      orgsService.revokeInvitation(orgSlug!, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgSlug] })
    },
  })

  return {
    org: orgQuery.data,
    orgSlug,
    isLoading: orgQuery.isLoading,
    error: orgQuery.error,
    members: membersQuery.data ?? [],
    membersLoading: membersQuery.isLoading,
    invitations: invitationsQuery.data ?? [],
    invitationsLoading: invitationsQuery.isLoading,
    removeMember,
    inviteMember,
    revokeInvitation,
  }
}
