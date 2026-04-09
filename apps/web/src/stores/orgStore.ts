import { create } from 'zustand'
import type { Organization, Membership } from '../types'

interface OrgState {
  orgs: Organization[]
  memberships: Membership[]
  isLoading: boolean
  setOrgs: (orgs: Organization[]) => void
  setMemberships: (memberships: Membership[]) => void
  addOrg: (org: Organization) => void
  removeOrg: (orgId: string) => void
  setLoading: (loading: boolean) => void
}

export const useOrgStore = create<OrgState>((set) => ({
  orgs: [],
  memberships: [],
  isLoading: false,

  setOrgs: (orgs) => set({ orgs }),

  setMemberships: (memberships) => set({ memberships }),

  addOrg: (org) =>
    set((state) => ({ orgs: [...state.orgs, org] })),

  removeOrg: (orgId) =>
    set((state) => ({
      orgs: state.orgs.filter((o) => o.id !== orgId),
    })),

  setLoading: (isLoading) => set({ isLoading }),
}))
