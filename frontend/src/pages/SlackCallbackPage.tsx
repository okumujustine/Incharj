import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import apiClient from '../services/api'
import { PageSpinner } from '../components/ui/Spinner'

export function SlackCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const code = searchParams.get('code')
    if (!code) {
      window.close()
      setTimeout(() => navigate('/settings', { replace: true }), 400)
      return
    }

    apiClient
      .get('/slack/oauth/callback', { params: { code } })
      .then(() => {
        window.close()
        setTimeout(() => navigate('/settings', { replace: true }), 400)
      })
      .catch(() => {
        window.close()
        setTimeout(() => navigate('/settings', { replace: true }), 400)
      })
  }, [])

  return <PageSpinner />
}
