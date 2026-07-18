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
  author: Profile
  media: NoteMedia[]
  like_count: number
  comment_count: number
  favorite_count: number
  viewer_liked?: boolean
  viewer_favorited?: boolean
}

export type CommentItem = {
  id: string
  note_id: string
  author_id: string
  parent_id: string | null
  content: string
  created_at: string
  updated_at: string
  author: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
}

export type NotificationItem = {
  id: string
  recipient_id: string
  actor_id: string | null
  kind: 'like' | 'comment' | 'follow' | 'system'
  note_id: string | null
  comment_id: string | null
  message: string | null
  read_at: string | null
  created_at: string
  actor?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}
