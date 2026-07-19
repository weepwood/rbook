export type AccessLevel = 'member' | 'moderator' | 'administrator'
export type AccountState = 'enabled' | 'disabled'

export type UserAccess = {
  user_id: string
  access_level: AccessLevel
  state: AccountState
  updated_at?: string
}

export type Profile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string
  location: string | null
  follower_count: number
  following_count: number
  note_count: number
  created_at?: string
  updated_at?: string
}

export type NoteMedia = {
  id: string
  note_id: string
  storage_path: string
  public_url?: string
  width: number | null
  height: number | null
  sort_order: number
  mime_type?: string | null
  size_bytes?: number | null
  thumbnail_path?: string | null
  alt_text?: string | null
  upload_state?: 'pending' | 'uploading' | 'ready' | 'failed'
}

export type Note = {
  id: string
  author_id: string
  title: string
  content: string
  tags: string[]
  location: string | null
  cover_url: string | null
  created_at: string
  updated_at?: string
  published_at?: string | null
  status?: 'draft' | 'published' | 'archived'
  version?: number
  author: Profile
  media: NoteMedia[]
  like_count: number
  comment_count: number
  favorite_count: number
  view_count?: number
  viewer_liked?: boolean
  viewer_favorited?: boolean
  recommendation_reason?: string
}

export type CommentItem = {
  id: string
  note_id: string
  author_id: string
  parent_id: string | null
  content: string
  created_at: string
  updated_at: string
  like_count: number
  reply_count: number
  viewer_liked?: boolean
  author: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
}

export type CommentThread = CommentItem & {
  replies: CommentItem[]
}

export type UserConnection = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'bio' | 'follower_count' | 'following_count' | 'note_count'>

export type NotificationItem = {
  id: string
  recipient_id: string
  actor_id: string | null
  kind: 'like' | 'comment' | 'reply' | 'follow' | 'system'
  note_id: string | null
  comment_id: string | null
  target_type?: 'note' | 'comment' | 'profile' | 'system' | null
  target_id?: string | null
  target_path?: string | null
  message: string | null
  metadata?: Record<string, unknown>
  read_at: string | null
  created_at: string
  actor?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}
