import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { orgsService } from '../services/orgs'
import { useAuthStore } from '../stores/authStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export function CreateOrgPage() {
  const navigate = useNavigate()
  const setCurrentOrg = useAuthStore((s) => s.setCurrentOrg)
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError] = useState('')

  const createOrg = useMutation({
    mutationFn: orgsService.create,
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] })
      setCurrentOrg(org)
      navigate(`/${org.slug}/search`)
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to create organization'
      setError(message)
    },
  })

  function handleNameChange(value: string) {
    setName(value)
    if (!slugEdited) {
      setSlug(slugify(value))
    }
  }

  function handleSlugChange(value: string) {
    setSlugEdited(true)
    setSlug(slugify(value))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim() || !slug.trim()) return
    createOrg.mutate({ name: name.trim(), slug: slug.trim() })
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <button
          onClick={() => navigate('/orgs')}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors mb-8"
        >
          <ArrowLeft size={13} />
          Back to organizations
        </button>

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-text-primary">New organization</h1>
          <p className="text-sm text-text-muted mt-1">
            Create a workspace for your team's knowledge base
          </p>
        </div>

        <div className="bg-bg-surface border border-border rounded p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Organization name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Corp"
              required
            />
            <Input
              label="URL slug"
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="acme-corp"
              hint="Used in URLs. Only lowercase letters, numbers, and hyphens."
              required
            />

            {error && (
              <div className="bg-error/10 border border-error/20 rounded px-3 py-2">
                <p className="text-xs text-error">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={createOrg.isPending}
              className="w-full mt-1"
              disabled={!name.trim() || !slug.trim()}
            >
              Create organization
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
