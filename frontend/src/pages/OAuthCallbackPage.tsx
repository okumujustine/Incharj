import { useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { connectorsService } from '../services/connectors'
import { PageSpinner } from '../components/ui/Spinner'

export function OAuthCallbackPage() {
  const { kind } = useParams<{ kind: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code || !state || !kind) {
      navigate('/orgs', { replace: true })
      return
    }

    const stored = localStorage.getItem(`oauth_state:${state}`)
    if (!stored) {
      navigate('/orgs', { replace: true })
      return
    }

    const { connector_id, org_slug } = JSON.parse(stored) as {
      connector_id: string
      org_slug: string
      kind: string
    }

    localStorage.removeItem(`oauth_state:${state}`)

    connectorsService
      .handleOAuthCallback(kind, code, state, connector_id, org_slug)
      .then(() => navigate(`/${org_slug}/connectors`, { replace: true }))
      .catch(() => navigate(`/${org_slug}/connectors`, { replace: true }))
  }, [])

  return <PageSpinner />
}
