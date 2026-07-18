import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { AdminPage } from '@/pages/AdminPage'
import { FeedPage } from '@/pages/FeedPage'
import { ProfilePage } from '@/pages/ProfilePage'

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [authRequestKey, setAuthRequestKey] = useState(0)

  return (
    <AppShell onRefresh={() => setRefreshKey((value) => value + 1)} authRequestKey={authRequestKey}>
      <Routes>
        <Route
          path="/"
          element={<FeedPage refreshKey={refreshKey} onRequireAuth={() => setAuthRequestKey((value) => value + 1)} />}
        />
        <Route
          path="/explore"
          element={<FeedPage mode="explore" refreshKey={refreshKey} onRequireAuth={() => setAuthRequestKey((value) => value + 1)} />}
        />
        <Route
          path="/me"
          element={<ProfilePage onLogin={() => setAuthRequestKey((value) => value + 1)} />}
        />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </AppShell>
  )
}
