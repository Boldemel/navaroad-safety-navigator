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
      alerts: {
        Row: {
          active: boolean
          alert_type: string
          created_at: string
          id: string
          location: string
          message: string
          recommended_action: string | null
          severity: string
        }
        Insert: {
          active?: boolean
          alert_type: string
          created_at?: string
          id?: string
          location: string
          message: string
          recommended_action?: string | null
          severity?: string
        }
        Update: {
          active?: boolean
          alert_type?: string
          created_at?: string
          id?: string
          location?: string
          message?: string
          recommended_action?: string | null
          severity?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          message: string
          route: string | null
          severity: string
          source: string
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          message: string
          route?: string | null
          severity?: string
          source: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          message?: string
          route?: string | null
          severity?: string
          source?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      favorite_locations: {
        Row: {
          address: string
          category: string
          city: string | null
          country: string | null
          created_at: string
          id: string
          label: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          state: string | null
          user_id: string
        }
        Insert: {
          address: string
          category?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          label: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          state?: string | null
          user_id: string
        }
        Update: {
          address?: string
          category?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          label?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          state?: string | null
          user_id?: string
        }
        Relationships: []
      }
      hazard_reports: {
        Row: {
          confirm_count: number
          created_at: string
          description: string | null
          dispute_count: number
          expires_at: string | null
          hazard_type: string
          id: string
          latitude: number | null
          location: string
          longitude: number | null
          photo_url: string | null
          reporter_id: string | null
          severity: string
          status: string
        }
        Insert: {
          confirm_count?: number
          created_at?: string
          description?: string | null
          dispute_count?: number
          expires_at?: string | null
          hazard_type: string
          id?: string
          latitude?: number | null
          location: string
          longitude?: number | null
          photo_url?: string | null
          reporter_id?: string | null
          severity?: string
          status?: string
        }
        Update: {
          confirm_count?: number
          created_at?: string
          description?: string | null
          dispute_count?: number
          expires_at?: string | null
          hazard_type?: string
          id?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          photo_url?: string | null
          reporter_id?: string | null
          severity?: string
          status?: string
        }
        Relationships: []
      }
      hazard_votes: {
        Row: {
          created_at: string
          hazard_id: string
          id: string
          user_id: string
          vote: string
        }
        Insert: {
          created_at?: string
          hazard_id: string
          id?: string
          user_id: string
          vote: string
        }
        Update: {
          created_at?: string
          hazard_id?: string
          id?: string
          user_id?: string
          vote?: string
        }
        Relationships: [
          {
            foreignKeyName: "hazard_votes_hazard_id_fkey"
            columns: ["hazard_id"]
            isOneToOne: false
            referencedRelation: "hazard_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          driver_name: string | null
          id: string
          load_status: string | null
          notify_email: boolean | null
          notify_push: boolean | null
          notify_sms: boolean | null
          trailer_type: string | null
          truck_axles: number | null
          truck_hazmat: boolean
          truck_height_in: number | null
          truck_length_ft: number | null
          truck_type: string | null
          truck_weight_lbs: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_name?: string | null
          id: string
          load_status?: string | null
          notify_email?: boolean | null
          notify_push?: boolean | null
          notify_sms?: boolean | null
          trailer_type?: string | null
          truck_axles?: number | null
          truck_hazmat?: boolean
          truck_height_in?: number | null
          truck_length_ft?: number | null
          truck_type?: string | null
          truck_weight_lbs?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_name?: string | null
          id?: string
          load_status?: string | null
          notify_email?: boolean | null
          notify_push?: boolean | null
          notify_sms?: boolean | null
          trailer_type?: string | null
          truck_axles?: number | null
          truck_hazmat?: boolean
          truck_height_in?: number | null
          truck_length_ft?: number | null
          truck_type?: string | null
          truck_weight_lbs?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      saved_routes: {
        Row: {
          created_at: string
          destination: string
          id: string
          origin: string
          safety_score: number | null
          trailer_type: string | null
          truck_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          destination: string
          id?: string
          origin: string
          safety_score?: number | null
          trailer_type?: string | null
          truck_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          destination?: string
          id?: string
          origin?: string
          safety_score?: number | null
          trailer_type?: string | null
          truck_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_current_user: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
