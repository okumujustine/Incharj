import apiClient from './api'
import type { Organization, OrgRole, InviteRole, OrgSummary, Membership, Invitation } from '../types'

interface CreateOrgPayload {
  name: string
  slug: string
}

interface UpdateOrgPayload {
  name?: string
  logo_url?: string
}

interface InviteMemberPayload {
  email: string
  role: InviteRole
}

export const orgsService = {
  async list(): Promise<Organization[]> {
    const response = await apiClient.get<Organization[]>('/orgs')
    return response.data
  },

  // Returns all orgs the logged-in user belongs to, with their role in each.
  async listMine(): Promise<OrgSummary[]> {
    const response = await apiClient.get<OrgSummary[]>('/users/me/orgs')
    return response.data
  },

  async create(payload: CreateOrgPayload): Promise<Organization> {
    const response = await apiClient.post<Organization>('/orgs', payload)
    return response.data
  },

  async get(slug: string): Promise<Organization> {
    const response = await apiClient.get<Organization>(`/orgs/${slug}`)
    return response.data
  },

  async update(slug: string, payload: UpdateOrgPayload): Promise<Organization> {
    const response = await apiClient.patch<Organization>(`/orgs/${slug}`, payload)
    return response.data
  },

  async delete(slug: string): Promise<void> {
    await apiClient.delete(`/orgs/${slug}`)
  },

  async listMembers(slug: string): Promise<Membership[]> {
    const response = await apiClient.get<Membership[]>(`/orgs/${slug}/members`)
    return response.data
  },

  async updateMemberRole(
    slug: string,
    userId: string,
    role: OrgRole
  ): Promise<Membership> {
    const response = await apiClient.patch<Membership>(
      `/orgs/${slug}/members/${userId}`,
      { role }
    )
    return response.data
  },

  async removeMember(slug: string, userId: string): Promise<void> {
    await apiClient.delete(`/orgs/${slug}/members/${userId}`)
  },

  async listInvitations(slug: string): Promise<Invitation[]> {
    const response = await apiClient.get<Invitation[]>(`/orgs/${slug}/invitations`)
    return response.data
  },

  async invite(slug: string, payload: InviteMemberPayload): Promise<Invitation> {
    const response = await apiClient.post<Invitation>(
      `/orgs/${slug}/invitations`,
      payload
    )
    return response.data
  },

  async revokeInvitation(slug: string, invitationId: string): Promise<void> {
    await apiClient.delete(`/orgs/${slug}/invitations/${invitationId}`)
  },
}
