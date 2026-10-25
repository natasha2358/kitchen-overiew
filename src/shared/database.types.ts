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
      cooking_confirmations: {
        Row: {
          actor_id: string
          created_at: string
          household_id: string
          id: string
          recipe_index: number | null
          result: Json
          snapshot: Json
          suggestion_id: string | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          household_id: string
          id: string
          recipe_index?: number | null
          result: Json
          snapshot: Json
          suggestion_id?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          household_id?: string
          id?: string
          recipe_index?: number | null
          result?: Json
          snapshot?: Json
          suggestion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cooking_confirmations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cooking_confirmations_household_id_id_fkey"
            columns: ["household_id", "id"]
            isOneToOne: false
            referencedRelation: "inventory_operations"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "cooking_confirmations_household_id_suggestion_id_fkey"
            columns: ["household_id", "suggestion_id"]
            isOneToOne: false
            referencedRelation: "meal_suggestions"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      food_preferences: {
        Row: {
          dietary: string[]
          excluded: string[]
          household_id: string
          revision: number
          servings: number
        }
        Insert: {
          dietary?: string[]
          excluded?: string[]
          household_id: string
          revision?: number
          servings?: number
        }
        Update: {
          dietary?: string[]
          excluded?: string[]
          household_id?: string
          revision?: number
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "food_preferences_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
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
          erasure_started_at: string | null
          id: string
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          erasure_started_at?: string | null
          id?: string
          name?: string
          timezone?: string
        }
        Update: {
          created_at?: string
          erasure_started_at?: string | null
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
          receipt_line_id: string | null
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
          receipt_line_id?: string | null
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
          receipt_line_id?: string | null
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
          {
            foreignKeyName: "inventory_batches_household_id_receipt_line_id_fkey"
            columns: ["household_id", "receipt_line_id"]
            isOneToOne: false
            referencedRelation: "receipt_lines"
            referencedColumns: ["household_id", "id"]
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
      list_operations: {
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
            foreignKeyName: "list_operations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_suggestions: {
        Row: {
          attempt: string
          attempts: number
          created_at: string
          error_code: string | null
          household_id: string
          id: string
          lease_until: string
          model: string
          prompt_version: string
          recipes: Json | null
          snapshot: Json
          status: string
        }
        Insert: {
          attempt: string
          attempts?: number
          created_at?: string
          error_code?: string | null
          household_id: string
          id: string
          lease_until: string
          model: string
          prompt_version: string
          recipes?: Json | null
          snapshot: Json
          status: string
        }
        Update: {
          attempt?: string
          attempts?: number
          created_at?: string
          error_code?: string | null
          household_id?: string
          id?: string
          lease_until?: string
          model?: string
          prompt_version?: string
          recipes?: Json | null
          snapshot?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_suggestions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_meals: {
        Row: {
          cancelled: boolean
          cooking_id: string | null
          created_at: string
          household_id: string
          id: string
          planned_on: string
          recipe: Json | null
          recipe_index: number | null
          revision: number
          servings: number
          slot: string
          suggestion_id: string | null
          title: string
        }
        Insert: {
          cancelled?: boolean
          cooking_id?: string | null
          created_at?: string
          household_id: string
          id: string
          planned_on: string
          recipe?: Json | null
          recipe_index?: number | null
          revision?: number
          servings: number
          slot: string
          suggestion_id?: string | null
          title: string
        }
        Update: {
          cancelled?: boolean
          cooking_id?: string | null
          created_at?: string
          household_id?: string
          id?: string
          planned_on?: string
          recipe?: Json | null
          recipe_index?: number | null
          revision?: number
          servings?: number
          slot?: string
          suggestion_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_meals_household_id_cooking_id_fkey"
            columns: ["household_id", "cooking_id"]
            isOneToOne: true
            referencedRelation: "cooking_confirmations"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "planned_meals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_meals_household_id_suggestion_id_fkey"
            columns: ["household_id", "suggestion_id"]
            isOneToOne: false
            referencedRelation: "meal_suggestions"
            referencedColumns: ["household_id", "id"]
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
          confirmation: Json | null
          created_at: string
          currency: string | null
          deletion_token: string | null
          filename: string
          household_id: string
          id: string
          merchant: string | null
          object_path: string
          purchased_on: string | null
          receipt_number: string | null
          revision: number
          source_deleted_at: string | null
          source_path: string | null
          status: string
          total: number | null
          upload_operation: string
          uploaded_by: string
          verified_hash: string | null
        }
        Insert: {
          canonical_id?: string | null
          confirmation?: Json | null
          created_at?: string
          currency?: string | null
          deletion_token?: string | null
          filename: string
          household_id: string
          id?: string
          merchant?: string | null
          object_path: string
          purchased_on?: string | null
          receipt_number?: string | null
          revision?: number
          source_deleted_at?: string | null
          source_path?: string | null
          status?: string
          total?: number | null
          upload_operation: string
          uploaded_by: string
          verified_hash?: string | null
        }
        Update: {
          canonical_id?: string | null
          confirmation?: Json | null
          created_at?: string
          currency?: string | null
          deletion_token?: string | null
          filename?: string
          household_id?: string
          id?: string
          merchant?: string | null
          object_path?: string
          purchased_on?: string | null
          receipt_number?: string | null
          revision?: number
          source_deleted_at?: string | null
          source_path?: string | null
          status?: string
          total?: number | null
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
      shopping_items: {
        Row: {
          checked: boolean
          created_at: string
          household_id: string
          id: string
          label: string
          product_id: string | null
          quantity: number
          removed: boolean
          revision: number
          source_key: string | null
          unit: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          household_id: string
          id: string
          label: string
          product_id?: string | null
          quantity: number
          removed?: boolean
          revision?: number
          source_key?: string | null
          unit: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          household_id?: string
          id?: string
          label?: string
          product_id?: string | null
          quantity?: number
          removed?: boolean
          revision?: number
          source_key?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_items_household_id_product_id_fkey"
            columns: ["household_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_id: string
          balance: number
          batch_id: string
          cooking_id: string | null
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
          cooking_id?: string | null
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
          cooking_id?: string | null
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
            foreignKeyName: "stock_movements_household_id_cooking_id_fkey"
            columns: ["household_id", "cooking_id"]
            isOneToOne: false
            referencedRelation: "cooking_confirmations"
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
      account_erasure_batch: { Args: { p_user: string }; Returns: Json }
      begin_account_erasure: { Args: { p_user: string }; Returns: undefined }
      begin_meal_suggestion: {
        Args: {
          p_household: string
          p_model: string
          p_prompt: string
          p_request: string
        }
        Returns: Json
      }
      begin_receipt_deletion: { Args: { p_receipt: string }; Returns: Json }
      bootstrap_household: { Args: { p_timezone?: string }; Returns: string }
      confirm_cooking: {
        Args: { p_household: string; p_operation: string; p_request: Json }
        Returns: Json
      }
      confirm_receipt: {
        Args: {
          p_acknowledged?: string[]
          p_operation: string
          p_receipt: string
          p_revision: number
        }
        Returns: Json
      }
      finalize_receipt_upload: {
        Args: { p_hash: string; p_receipt: string; p_user: string }
        Returns: Json
      }
      finish_account_erasure: { Args: { p_user: string }; Returns: undefined }
      finish_meal_suggestion: {
        Args: {
          p_attempt: string
          p_error?: string
          p_household: string
          p_recipes: Json
          p_request: string
        }
        Returns: undefined
      }
      finish_receipt_deletion: {
        Args: { p_receipt: string; p_token: string; p_user: string }
        Returns: undefined
      }
      get_batch_history: {
        Args: { p_batch: string; p_household: string }
        Returns: Json
      }
      get_inventory: { Args: { p_household: string }; Returns: Json }
      get_receipt_review: { Args: { p_receipt: string }; Returns: Json }
      get_shopping: { Args: { p_household: string }; Returns: Json }
      meal_context: { Args: { p_household: string }; Returns: Json }
      mutate_inventory: {
        Args: { p_household: string; p_operation: string; p_request: Json }
        Returns: Json
      }
      mutate_shopping: {
        Args: { p_household: string; p_operation: string; p_request: Json }
        Returns: Json
      }
      normalize_product_name: { Args: { value: string }; Returns: string }
      prepare_receipt: {
        Args: { p_filename: string; p_household: string; p_operation: string }
        Returns: Json
      }
      purge_account_household: { Args: { p_user: string }; Returns: undefined }
      receipt_duplicate_candidates: {
        Args: { p_receipt: string }
        Returns: Json
      }
      save_food_preferences: {
        Args: {
          p_dietary: string[]
          p_excluded: string[]
          p_household: string
          p_revision: number
          p_servings: number
        }
        Returns: number
      }
      save_planned_meal: {
        Args: { p_household: string; p_operation: string; p_request: Json }
        Returns: Json
      }
      save_receipt_review: {
        Args: {
          p_lines: Json
          p_metadata?: Json
          p_receipt: string
          p_revision: number
        }
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

