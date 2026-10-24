export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      household_memberships: {
        Row: {
          household_id: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          role?: string
          user_id: string
        }
        Update: {
          household_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_memberships_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      inventory_batches: {
        Row: {
          acquired_at: string
          base_unit: string
          expiry: string | null
          household_id: string
          id: string
          location_id: string
          package_count: number | null
          package_size: number | null
          product_id: string
          quantity: number
          revision: number
        }
        Insert: {
          acquired_at?: string
          base_unit: string
          expiry?: string | null
          household_id: string
          id?: string
          location_id: string
          package_count?: number | null
          package_size?: number | null
          product_id: string
          quantity: number
          revision?: number
        }
        Update: {
          acquired_at?: string
          base_unit?: string
          expiry?: string | null
          household_id?: string
          id?: string
          location_id?: string
          package_count?: number | null
          package_size?: number | null
          product_id?: string
          quantity?: number
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_household_id_location_id_fkey"
            columns: ["household_id", "location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "inventory_batches_household_id_product_id_base_unit_fkey"
            columns: ["household_id", "product_id", "base_unit"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["household_id", "id", "base_unit"]
          },
        ]
      }
      inventory_operations: {
        Row: {
          created_at: string
          household_id: string
          id: string
          request: Json
          result: Json
        }
        Insert: {
          created_at?: string
          household_id: string
          id: string
          request: Json
          result: Json
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          request?: Json
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "inventory_operations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          aliases: string[]
          always_available: boolean
          base_unit: string
          household_id: string
          id: string
          name: string
          normalized_name: string | null
        }
        Insert: {
          aliases?: string[]
          always_available?: boolean
          base_unit: string
          household_id: string
          id?: string
          name: string
          normalized_name?: string | null
        }
        Update: {
          aliases?: string[]
          always_available?: boolean
          base_unit?: string
          household_id?: string
          id?: string
          name?: string
          normalized_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_imports: {
        Row: {
          canonical_id: string | null
          created_at: string
          filename: string
          household_id: string
          id: string
          object_path: string
          revision: number
          status: string
          upload_operation: string
          uploaded_by: string
          verified_hash: string | null
        }
        Insert: {
          canonical_id?: string | null
          created_at?: string
          filename: string
          household_id: string
          id?: string
          object_path: string
          revision?: number
          status?: string
          upload_operation: string
          uploaded_by: string
          verified_hash?: string | null
        }
        Update: {
          canonical_id?: string | null
          created_at?: string
          filename?: string
          household_id?: string
          id?: string
          object_path?: string
          revision?: number
          status?: string
          upload_operation?: string
          uploaded_by?: string
          verified_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_imports_household_id_canonical_id_fkey"
            columns: ["household_id", "canonical_id"]
            isOneToOne: false
            referencedRelation: "receipt_imports"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "receipt_imports_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_lines: {
        Row: {
          expiry: string | null
          household_id: string
          id: string
          included: boolean
          location_id: string | null
          product_id: string | null
          proposed: Json | null
          quantity: number | null
          receipt_id: string
          reviewed_name: string | null
          source_label: string
          unit: string | null
        }
        Insert: {
          expiry?: string | null
          household_id: string
          id: string
          included?: boolean
          location_id?: string | null
          product_id?: string | null
          proposed?: Json | null
          quantity?: number | null
          receipt_id: string
          reviewed_name?: string | null
          source_label: string
          unit?: string | null
        }
        Update: {
          expiry?: string | null
          household_id?: string
          id?: string
          included?: boolean
          location_id?: string | null
          product_id?: string | null
          proposed?: Json | null
          quantity?: number | null
          receipt_id?: string
          reviewed_name?: string | null
          source_label?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_lines_household_id_location_id_fkey"
            columns: ["household_id", "location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "receipt_lines_household_id_product_id_fkey"
            columns: ["household_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "receipt_lines_household_id_receipt_id_fkey"
            columns: ["household_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "receipt_imports"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_id: string
          balance: number
          batch_id: string
          created_at: string
          delta: number
          household_id: string
          id: string
          operation_id: string
          reason: string
        }
        Insert: {
          actor_id: string
          balance: number
          batch_id: string
          created_at?: string
          delta: number
          household_id: string
          id?: string
          operation_id: string
          reason: string
        }
        Update: {
          actor_id?: string
          balance?: number
          batch_id?: string
          created_at?: string
          delta?: number
          household_id?: string
          id?: string
          operation_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_household_id_batch_id_fkey"
            columns: ["household_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_household_id_operation_id_fkey"
            columns: ["household_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "inventory_operations"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          household_id: string
          id: string
          name: string
        }
        Insert: {
          household_id: string
          id?: string
          name: string
        }
        Update: {
          household_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_locations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_household: { Args: { p_timezone?: string }; Returns: string }
      finalize_receipt_upload: {
        Args: { p_hash: string; p_receipt: string; p_user: string }
        Returns: Json
      }
      get_batch_history: {
        Args: { p_batch: string; p_household: string }
        Returns: Json
      }
      get_inventory: { Args: { p_household: string }; Returns: Json }
      get_receipt_review: { Args: { p_receipt: string }; Returns: Json }
      mutate_inventory: {
        Args: { p_household: string; p_operation: string; p_request: Json }
        Returns: Json
      }
      normalize_product_name: { Args: { value: string }; Returns: string }
      prepare_receipt: {
        Args: { p_filename: string; p_household: string; p_operation: string }
        Returns: Json
      }
      save_receipt_review: {
        Args: { p_lines: Json; p_receipt: string; p_revision: number }
        Returns: number
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

