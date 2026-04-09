import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { connectorsService } from '../services/connectors'
import { PageSpinner } from '../components/ui/Spinner'

export const OAUTH_CALLBACK_STORAGE_KEY = 'oauth_callback_result'

export function OAuthCallbackPage() {
  const { kind } = useParams<{ kind: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const ran = useRef(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code || !state || !kind) {
      navigate('/search', { replace: true })
      return
    }

    const stored = localStorage.getItem(`oauth_state:${state}`)
    if (!stored) {
      navigate('/search', { replace: true })
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
      .then(() => {
        // Signal the parent tab that auth completed successfully.
        localStorage.setItem(
          OAUTH_CALLBACK_STORAGE_KEY,
          JSON.stringify({ success: true, connector_id, timestamp: Date.now() })
        )
        setDone(true)
        // Close this tab if it was opened by the app; otherwise fall back to navigating.
        window.close()
        // window.close() is a no-op if the tab wasn't script-opened — navigate after a short
        // delay so we only land here if close() didn't work.
        setTimeout(() => navigate('/connectors', { replace: true }), 400)
      })
      .catch(() => {
        localStorage.setItem(
          OAUTH_CALLBACK_STORAGE_KEY,
          JSON.stringify({ success: false, timestamp: Date.now() })
        )
        window.close()
        setTimeout(() => navigate('/connectors', { replace: true }), 400)
      })
  }, [])

  if (done) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <p className="text-sm text-text-muted">Connected. You can close this tab.</p>
      </div>
    )
  }

  return <PageSpinner />
}
