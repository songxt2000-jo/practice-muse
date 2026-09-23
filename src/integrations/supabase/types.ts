export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      books: {
        Row: {
          composer: string | null
          cover_url: string | null
          created_at: string
          id: string
          page_count: number
          scan_status: string
          source_type: string
          storage_path: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          composer?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          page_count?: number
          scan_status?: string
          source_type?: string
          storage_path?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          composer?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          page_count?: number
          scan_status?: string
          source_type?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pieces: {
        Row: {
          abc_notation: string | null
          background: string | null
          book_id: string | null
          composer: string | null
          created_at: string
          default_tempo: number
          end_page: number | null
          era: string | null
          id: string
          key_signature: string | null
          mood: string | null
          score_layout: Json | null
          sort_order: number
          start_page: number | null
          story: string | null
          title: string
          transcribe_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          abc_notation?: string | null
          background?: string | null
          book_id?: string | null
          composer?: string | null
          created_at?: string
          default_tempo?: number
          end_page?: number | null
          era?: string | null
          id?: string
          key_signature?: string | null
          mood?: string | null
          score_layout?: Json | null
          sort_order?: number
          start_page?: number | null
          story?: string | null
          title: string
          transcribe_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          abc_notation?: string | null
          background?: string | null
          book_id?: string | null
          composer?: string | null
          created_at?: string
          default_tempo?: number
          end_page?: number | null
          era?: string | null
          id?: string
          key_signature?: string | null
          mood?: string | null
          score_layout?: Json | null
          sort_order?: number
          start_page?: number | null
          story?: string | null
          title?: string
          transcribe_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pieces_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_session_items: {
        Row: {
          created_at: string
          id: string
          loop_from: number | null
          loop_to: number | null
          piece_id: string | null
          piece_title: string | null
          seconds: number
          session_id: string
          tempo: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          loop_from?: number | null
          loop_to?: number | null
          piece_id?: string | null
          piece_title?: string | null
          seconds?: number
          session_id: string
          tempo?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          loop_from?: number | null
          loop_to?: number | null
          piece_id?: string | null
          piece_title?: string | null
          seconds?: number
          session_id?: string
          tempo?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_session_items_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_session_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "practice_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          notes: string | null
          piece_count: number
          started_at: string
          total_seconds: number
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          piece_count?: number
          started_at?: string
          total_seconds?: number
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          piece_count?: number
          started_at?: string
          total_seconds?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
