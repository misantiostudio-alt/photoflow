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
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      event_groups: {
        Row: {
          active: boolean
          created_at: string
          event_id: string
          id: string
          name: string
          share_token: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          event_id: string
          id?: string
          name: string
          share_token?: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          share_token?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_groups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
          share_token: string
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
          share_token?: string
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
          share_token?: string
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
          public_token: string
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
          public_token?: string
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
          public_token?: string
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
          code: string | null
          created_at: string
          description: string | null
          digital_copy: boolean
          event_id: string
          framed: boolean
          id: string
          name: string
          price: number
          print_size: string
          product_type: string
          quantity: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          digital_copy?: boolean
          event_id: string
          framed?: boolean
          id?: string
          name: string
          price?: number
          print_size?: string
          product_type?: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          digital_copy?: boolean
          event_id?: string
          framed?: boolean
          id?: string
          name?: string
          price?: number
          print_size?: string
          product_type?: string
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
          event_group_id: string | null
          event_id: string
          full_name: string
          gallery_status: string
          id: string
          notes: string | null
          organization: string | null
          participant_code: string
          resume_token: string
          shooting_status: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          batch?: string | null
          contact_number?: string | null
          created_at?: string
          email?: string | null
          event_group_id?: string | null
          event_id: string
          full_name: string
          gallery_status?: string
          id?: string
          notes?: string | null
          organization?: string | null
          participant_code: string
          resume_token?: string
          shooting_status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          batch?: string | null
          contact_number?: string | null
          created_at?: string
          email?: string | null
          event_group_id?: string | null
          event_id?: string
          full_name?: string
          gallery_status?: string
          id?: string
          notes?: string | null
          organization?: string | null
          participant_code?: string
          resume_token?: string
          shooting_status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_event_group_id_fkey"
            columns: ["event_group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
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
          client_request_id: string | null
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
          client_request_id?: string | null
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
          client_request_id?: string | null
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
          event_group_id: string | null
          event_id: string
          favorite: boolean
          file_name: string | null
          group_name: string | null
          id: string
          is_separator: boolean
          participant_id: string | null
          photo_type: string
          sort_order: number
          storage_path: string | null
          url: string
        }
        Insert: {
          created_at?: string
          event_group_id?: string | null
          event_id: string
          favorite?: boolean
          file_name?: string | null
          group_name?: string | null
          id?: string
          is_separator?: boolean
          participant_id?: string | null
          photo_type?: string
          sort_order?: number
          storage_path?: string | null
          url: string
        }
        Update: {
          created_at?: string
          event_group_id?: string | null
          event_id?: string
          favorite?: boolean
          file_name?: string | null
          group_name?: string | null
          id?: string
          is_separator?: boolean
          participant_id?: string | null
          photo_type?: string
          sort_order?: number
          storage_path?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_event_group_id_fkey"
            columns: ["event_group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
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
      staff_security: {
        Row: {
          created_at: string
          failed_attempts: number
          locked_until: string | null
          pin_enabled: boolean
          pin_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_enabled?: boolean
          pin_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_enabled?: boolean
          pin_hash?: string | null
          updated_at?: string
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
      bootstrap_available: { Args: never; Returns: boolean }
      can_manage_staff: { Args: { _user_id: string }; Returns: boolean }
      claim_solo_portrait_v2: {
        Args: {
          _contact_number: string
          _email?: string
          _event_id: string
          _full_name: string
          _group_name: string
          _organization: string
          _photo_id: string
        }
        Returns: {
          participant_code: string
          participant_id: string
        }[]
      }
      claim_solo_portrait_v3: {
        Args: {
          _contact_number: string
          _email?: string
          _event_id: string
          _full_name: string
          _organization: string
          _photo_id: string
        }
        Returns: {
          group_name: string
          participant_code: string
          participant_id: string
        }[]
      }
      claim_solo_portrait_v4: {
        Args: {
          _contact_number: string
          _email?: string
          _full_name: string
          _organization: string
          _photo_id: string
          _share_token: string
        }
        Returns: {
          group_name: string
          participant_code: string
          participant_id: string
          resume_token: string
        }[]
      }
      clear_my_pin: { Args: never; Returns: undefined }
      create_event_with_groups_v1: {
        Args: {
          _delivery_date?: string
          _description?: string
          _event_date?: string
          _event_type: string
          _groups?: string[]
          _id_prefix?: string
          _name: string
          _ordering_deadline?: string
          _payment_instructions?: string
          _slug: string
          _venue?: string
        }
        Returns: string
      }
      ensure_first_owner: { Args: never; Returns: boolean }
      get_client_session_v1: {
        Args: { _resume_token: string }
        Returns: {
          contact_number: string
          email: string
          full_name: string
          group_name: string
          order_id: string
          order_number: string
          organization: string
          paid: number
          participant_code: string
          participant_id: string
          payment_pending: boolean
          payment_status: string
          pending_amount: number
          photo_id: string
          photo_path: string
          production_status: string
          public_token: string
          share_token: string
          total: number
        }[]
      }
      get_gallery_by_token: {
        Args: { _share_token: string }
        Returns: {
          delivery_date: string
          event_id: string
          event_name: string
          event_slug: string
          group_id: string
          group_name: string
          ordering_deadline: string
          payment_instructions: string
        }[]
      }
      get_gallery_packages_by_token: {
        Args: { _share_token: string }
        Returns: {
          code: string
          description: string
          digital_copy: boolean
          framed: boolean
          id: string
          name: string
          price: number
          print_size: string
          product_type: string
          quantity: number
          sort_order: number
        }[]
      }
      get_gallery_photos_by_token: {
        Args: { _share_token: string }
        Returns: {
          claimed: boolean
          id: string
          photo_type: string
          sort_order: number
          storage_path: string
        }[]
      }
      get_my_security_settings: {
        Args: never
        Returns: {
          locked_until: string
          pin_enabled: boolean
        }[]
      }
      get_my_staff_roles: { Args: never; Returns: string[] }
      get_public_order_v2: {
        Args: { _public_token: string }
        Returns: {
          client_name: string
          delivered_at: string
          group_name: string
          order_number: string
          paid: number
          payment_pending: boolean
          payment_status: string
          pending_amount: number
          production_status: string
          total: number
        }[]
      }
      get_share_token_for_event: {
        Args: { _event_slug: string }
        Returns: string
      }
      get_share_token_for_group: {
        Args: { _event_slug: string; _group_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      recalculate_order_payment: {
        Args: { _order_id: string }
        Returns: undefined
      }
      release_order_v1: {
        Args: {
          _actor?: string
          _notes?: string
          _order_id: string
          _receiver_name: string
        }
        Returns: string
      }
      set_my_pin: { Args: { _pin: string }; Returns: undefined }
      submit_client_order_v2: {
        Args: {
          _group_package_id: string
          _participant_id: string
          _solo_addons?: Json
          _solo_photo_id: string
        }
        Returns: {
          order_id: string
          order_number: string
          public_token: string
          total: number
        }[]
      }
      submit_client_order_v3: {
        Args: {
          _group_package_id: string
          _participant_id: string
          _solo_addons?: Json
          _solo_photo_id: string
        }
        Returns: {
          order_id: string
          order_number: string
          public_token: string
          total: number
        }[]
      }
      submit_client_order_v4: {
        Args: {
          _group_package_id: string
          _resume_token: string
          _solo_addons?: Json
        }
        Returns: {
          order_id: string
          order_number: string
          public_token: string
          total: number
        }[]
      }
      submit_client_payment_v2: {
        Args: {
          _amount: number
          _method: string
          _proof_path?: string
          _public_token: string
          _reference?: string
        }
        Returns: string
      }
      submit_client_payment_v3: {
        Args: {
          _amount: number
          _client_request_id?: string
          _method: string
          _proof_path?: string
          _public_token: string
          _reference?: string
        }
        Returns: string
      }
      update_event_with_groups_v1: {
        Args: {
          _delivery_date?: string
          _description?: string
          _event_date?: string
          _event_id: string
          _event_type: string
          _groups?: string[]
          _id_prefix?: string
          _name: string
          _ordering_deadline?: string
          _payment_instructions?: string
          _venue?: string
        }
        Returns: string
      }
      verify_my_pin: { Args: { _pin: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "owner"
        | "photographer"
        | "cashier"
        | "production"
        | "delivery"
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
    Enums: {
      app_role: [
        "super_admin",
        "owner",
        "photographer",
        "cashier",
        "production",
        "delivery",
      ],
    },
  },
} as const
