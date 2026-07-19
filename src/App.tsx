import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { AdminPage } from '@/pages/AdminPage'
import { CreatorAnalyticsPage } from '@/pages/CreatorAnalyticsPage'
import { FeedPage } from '@/pages/FeedPage'
import { NotePage } from '@/pages/NotePage'
import { ProfilePage } from '@/pages/ProfilePage'
import { PublicProfilePage } from '@/pages/PublicProfilePage'
import { RecommendedFeedPage } from '@/pages/RecommendedFeedPage'
import { SearchPage } from '@/pages/SearchPage'

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [authRequestKey, setAuthRequestKey] = useState(0)
  const requireAuth = () => setAuthRequestKey((value) => value + 1)

  return (
    <AppShell onRefresh={() => setRefreshKey((value) => value + 1)} authRequestKey={authRequestKey}>
      <Routes>
        <Route path="/" element={<RecommendedFeedPage refreshKey={refreshKey} onRequireAuth={requireAuth} />} />
        <Route path="/search" element={<SearchPage onRequireAuth={requireAuth} />} />
        <Route path="/explore" element={<FeedPage mode="explore" refreshKey={refreshKey} onRequireAuth={requireAuth} />} />
        <Route path="/note/:noteId" element={<NotePage onRequireAuth={requireAuth} />} />
        <Route path="/user/:username" element={<PublicProfilePage onRequireAuth={requireAuth} />} />
        <Route path="/me" element={<ProfilePage onLogin={requireAuth} />} />
        <Route path="/me/analytics" element={<CreatorAnalyticsPage onLogin={requireAuth} />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </AppShell>
  )
}
