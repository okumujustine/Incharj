import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthGuard } from './components/auth/AuthGuard'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { AcceptInvitePage } from './pages/AcceptInvitePage'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage'
import { OrgSelectorPage } from './pages/OrgSelectorPage'
import { CreateOrgPage } from './pages/CreateOrgPage'
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

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
      <Route
        path="/oauth/:kind/callback"
        element={
          <AuthGuard>
            <OAuthCallbackPage />
          </AuthGuard>
        }
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <AuthGuard>
            <Navigate to="/orgs" replace />
          </AuthGuard>
        }
      />

      <Route
        path="/orgs"
        element={
          <AuthGuard>
            <OrgSelectorPage />
          </AuthGuard>
        }
      />

      <Route
        path="/orgs/new"
        element={
          <AuthGuard>
            <CreateOrgPage />
          </AuthGuard>
        }
      />

      {/* Profile (no sidebar layout) */}
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

      {/* Org-scoped routes with sidebar layout */}
      <Route
        path="/:orgSlug"
        element={
          <AuthGuard>
            <AppLayout />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="search" replace />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="files" element={<FilesPage />} />
        <Route path="connectors" element={<ConnectorsPage />} />
        <Route path="connectors/:id" element={<ConnectorDetailPage />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<GeneralSettingsPage />} />
          <Route path="members" element={<MembersSettingsPage />} />
        </Route>
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
