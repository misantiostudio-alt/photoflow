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
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          notes: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          notes?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          delivered_by: string | null
          id: string
          notes: string | null
          order_id: string
          receiver_name: string | null
          status: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          id?: string
          notes?: string | null
          order_id: string
          receiver_name?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          receiver_name?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          delivery_date: string | null
          description: string | null
          event_date: string | null
          event_type: string
          id: string
          id_prefix: string
          name: string
          ordering_deadline: string | null
          payment_instructions: string | null
          slug: string
          status: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          event_date?: string | null
          event_type?: string
          id?: string
          id_prefix?: string
          name: string
          ordering_deadline?: string | null
          payment_instructions?: string | null
          slug: string
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          event_date?: string | null
          event_type?: string
          id?: string
          id_prefix?: string
          name?: string
          ordering_deadline?: string | null
          payment_instructions?: string | null
          slug?: string
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          framed: boolean
          id: string
          kind: string
          label: string
          order_id: string
          photo_id: string | null
          print_size: string | null
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          framed?: boolean
          id?: string
          kind?: string
          label: string
          order_id: string
          photo_id?: string | null
          print_size?: string | null
          quantity?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          framed?: boolean
          id?: string
          kind?: string
          label?: string
          order_id?: string
          photo_id?: string | null
          print_size?: string | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          delivered_at: string | null
          event_id: string
          id: string
          notes: string | null
          order_number: string
          package_id: string | null
          paid: number
          participant_id: string
          payment_method: string | null
          payment_status: string
          photo_id: string | null
          production_status: string
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          event_id: string
          id?: string
          notes?: string | null
          order_number: string
          package_id?: string | null
          paid?: number
          participant_id: string
          payment_method?: string | null
          payment_status?: string
          photo_id?: string | null
          production_status?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          order_number?: string
          package_id?: string | null
          paid?: number
          participant_id?: string
          payment_method?: string | null
          payment_status?: string
          photo_id?: string | null
          production_status?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          digital_copy: boolean
          event_id: string
          framed: boolean
          id: string
          name: string
          price: number
          print_size: string
          quantity: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          digital_copy?: boolean
          event_id: string
          framed?: boolean
          id?: string
          name: string
          price?: number
          print_size?: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          digital_copy?: boolean
          event_id?: string
          framed?: boolean
          id?: string
          name?: string
          price?: number
          print_size?: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          batch: string | null
          contact_number: string | null
          created_at: string
          email: string | null
          event_id: string
          full_name: string
          gallery_status: string
          id: string
          notes: string | null
          organization: string | null
          participant_code: string
          shooting_status: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          batch?: string | null
          contact_number?: string | null
          created_at?: string
          email?: string | null
          event_id: string
          full_name: string
          gallery_status?: string
          id?: string
          notes?: string | null
          organization?: string | null
          participant_code: string
          shooting_status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          batch?: string | null
          contact_number?: string | null
          created_at?: string
          email?: string | null
          event_id?: string
          full_name?: string
          gallery_status?: string
          id?: string
          notes?: string | null
          organization?: string | null
          participant_code?: string
          shooting_status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          notes: string | null
          order_id: string
          paid_at: string
          proof_url: string | null
          reference: string | null
          status: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          order_id: string
          paid_at?: string
          proof_url?: string | null
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          order_id?: string
          paid_at?: string
          proof_url?: string | null
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          created_at: string
          event_id: string
          favorite: boolean
          file_name: string | null
          id: string
          is_separator: boolean
          participant_id: string | null
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          event_id: string
          favorite?: boolean
          file_name?: string | null
          id?: string
          is_separator?: boolean
          participant_id?: string | null
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          event_id?: string
          favorite?: boolean
          file_name?: string | null
          id?: string
          is_separator?: boolean
          participant_id?: string | null
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_checks: {
        Row: {
          checked_by: string | null
          checklist: Json
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          stage: string
        }
        Insert: {
          checked_by?: string | null
          checklist?: Json
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          stage: string
        }
        Update: {
          checked_by?: string | null
          checklist?: Json
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_checks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "photographer" | "cashier" | "production" | "delivery"
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
      app_role: ["owner", "photographer", "cashier", "production", "delivery"],
    },
  },
} as const

