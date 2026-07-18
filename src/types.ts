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
