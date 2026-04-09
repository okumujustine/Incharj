import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthGuard } from './components/auth/AuthGuard'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { SetupPage } from './pages/SetupPage'
import { AcceptInvitePage } from './pages/AcceptInvitePage'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage'
import { SearchPage } from './pages/SearchPage'
import { FilesPage } from './pages/FilesPage'
import { ConnectorsPage } from './pages/ConnectorsPage'
import { ConnectorDetailPage } from './pages/ConnectorDetailPage'
import {
  SettingsLayout,
  GeneralSettingsPage,
  MembersSettingsPage,
} from './pages/SettingsPage'
import { ProfilePage } from './pages/ProfilePage'
import { SlackCallbackPage } from './pages/SlackCallbackPage'
import { ToastViewport } from './components/ui/ToastViewport'

export default function App() {
  return (
    <>
      <Routes>
        {/* First-run setup */}
        <Route path="/setup" element={<SetupPage />} />

        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/slack/oauth/callback"
          element={
            <AuthGuard>
              <SlackCallbackPage />
            </AuthGuard>
          }
        />
        <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
        <Route
          path="/oauth/:kind/callback"
          element={
            <AuthGuard>
              <OAuthCallbackPage />
            </AuthGuard>
          }
        />

        {/* App routes — no org slug in URL */}
        <Route
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route path="/" element={<Navigate to="/search" replace />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/connectors" element={<ConnectorsPage />} />
          <Route path="/connectors/:id" element={<ConnectorDetailPage />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<GeneralSettingsPage />} />
            <Route path="members" element={<MembersSettingsPage />} />
          </Route>
        </Route>

        {/* Profile (no sidebar) */}
        <Route
          path="/settings/profile"
          element={
            <AuthGuard>
              <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
                <ProfilePage />
              </div>
            </AuthGuard>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastViewport />
    </>
  )
}
