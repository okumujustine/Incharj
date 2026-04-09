import { useAuthStore } from '../stores/authStore'

export function useOrgSlug(): string {
  const slug = useAuthStore((s) => s.currentOrg?.slug)
  if (!slug) throw new Error('No org in context')
  return slug
}
