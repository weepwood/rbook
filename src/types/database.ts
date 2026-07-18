export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type TableDefinition<Row, Insert, Update = Partial<Insert>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type CommentRow = {
  id: string
  note_id: string
  author_id: string
  parent_id: string | null
  content: string
  created_at: string
  updated_at: string
}

type FavoriteRow = {
  note_id: string
  user_id: string
  created_at: string
}

type FollowRow = {
  follower_id: string
  following_id: string
  created_at: string
}

type LikeRow = {
  note_id: string
  user_id: string
  created_at: string
}

type NoteMediaRow = {
  id: string
  note_id: string
  storage_path: string
  width: number | null
  height: number | null
  sort_order: number
  created_at: string
}

type NoteStatus = 'draft' | 'published' | 'archived'

type NoteRow = {
  id: string
  author_id: string
  title: string
  content: string
  tags: string[]
  location: string | null
  cover_url: string | null
  status: NoteStatus
  view_count: number
  created_at: string
  updated_at: string
}

type ProfileRow = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string
  location: string | null
  follower_count: number
  following_count: number
  note_count: number
  created_at: string
  updated_at: string
}

export type Database = {
  public: {
    Tables: {
      comments: TableDefinition<
        CommentRow,
        {
          id?: string
          note_id: string
          author_id: string
          parent_id?: string | null
          content: string
          created_at?: string
          updated_at?: string
        }
      >
      favorites: TableDefinition<
        FavoriteRow,
        {
          note_id: string
          user_id: string
          created_at?: string
        }
      >
      follows: TableDefinition<
        FollowRow,
        {
          follower_id: string
          following_id: string
          created_at?: string
        }
      >
      likes: TableDefinition<
        LikeRow,
        {
          note_id: string
          user_id: string
          created_at?: string
        }
      >
      note_media: TableDefinition<
        NoteMediaRow,
        {
          id?: string
          note_id: string
          storage_path: string
          width?: number | null
          height?: number | null
          sort_order?: number
          created_at?: string
        }
      >
      notes: TableDefinition<
        NoteRow,
        {
          id?: string
          author_id: string
          title: string
          content: string
          tags?: string[]
          location?: string | null
          cover_url?: string | null
          status?: NoteStatus
          view_count?: number
          created_at?: string
          updated_at?: string
        }
      >
      profiles: TableDefinition<
        ProfileRow,
        {
          id: string
          username: string
          display_name: string
          avatar_url?: string | null
          bio?: string
          location?: string | null
          follower_count?: number
          following_count?: number
          note_count?: number
          created_at?: string
          updated_at?: string
        }
      >
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      note_status: NoteStatus
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
