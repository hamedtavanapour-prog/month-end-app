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
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          department_id: string | null
          entity_id: string | null
          entity_type: string
          id: number
          organization_id: string
          request_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          department_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: never
          organization_id: string
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          department_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: never
          organization_id?: string
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          organization_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          organization_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_departments: {
        Row: {
          department_id: string
          invitation_id: string
        }
        Insert: {
          department_id: string
          invitation_id: string
        }
        Update: {
          department_id?: string
          invitation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_departments_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_permissions: {
        Row: {
          allowed: boolean
          invitation_id: string
          permission_key: string
        }
        Insert: {
          allowed?: boolean
          invitation_id: string
          permission_key: string
        }
        Update: {
          allowed?: boolean
          invitation_id?: string
          permission_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_permissions_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_definitions"
            referencedColumns: ["key"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          display_name: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          reports_to_membership_id: string | null
          role: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          reports_to_membership_id?: string | null
          role: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          reports_to_membership_id?: string | null
          role?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_reports_to_membership_id_fkey"
            columns: ["reports_to_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_departments: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          membership_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          membership_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_departments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          granted_by: string | null
          membership_id: string
          permission_key: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          granted_by?: string | null
          membership_id: string
          permission_key: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          granted_by?: string | null
          membership_id?: string
          permission_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_permissions_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_definitions"
            referencedColumns: ["key"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          job_title: string | null
          last_login_at: string | null
          must_change_password: boolean
          organization_id: string
          reports_to_membership_id: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_title?: string | null
          last_login_at?: string | null
          must_change_password?: boolean
          organization_id: string
          reports_to_membership_id?: string | null
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_title?: string | null
          last_login_at?: string | null
          must_change_password?: boolean
          organization_id?: string
          reports_to_membership_id?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_reports_to_membership_id_fkey"
            columns: ["reports_to_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      department_managers: {
        Row: {
          assigned_by: string | null
          created_at: string
          department_id: string
          is_primary: boolean
          membership_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          department_id: string
          is_primary?: boolean
          membership_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          department_id?: string
          is_primary?: boolean
          membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_managers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_managers_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      permission_definitions: {
        Row: {
          area: string
          created_at: string
          description: string
          key: string
          label: string
          manager_assignable: boolean
        }
        Insert: {
          area: string
          created_at?: string
          description: string
          key: string
          label: string
          manager_assignable?: boolean
        }
        Update: {
          area?: string
          created_at?: string
          description?: string
          key?: string
          label?: string
          manager_assignable?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_states: {
        Row: {
          created_at: string
          data: Json
          organization_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          data?: Json
          organization_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          created_at?: string
          data?: Json
          organization_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          organization_id: string
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_team_invitation: {
        Args: { p_token_hash: string }
        Returns: string
      }
      create_team_invitation: {
        Args: {
          p_department_ids: string[]
          p_display_name: string
          p_email: string
          p_expires_at: string
          p_organization_id: string
          p_permission_keys: string[]
          p_role: string
          p_token_hash: string
        }
        Returns: string
      }
      create_restaurant_workspace: {
        Args: { p_name: string; p_owner_user_id: string; p_slug: string }
        Returns: string
      }
      get_invitation_details: {
        Args: { p_token_hash: string }
        Returns: {
          display_name: string
          email: string
          expires_at: string
          organization_name: string
          role: string
          status: string
        }[]
      }
      get_my_workspace_membership: {
        Args: { p_identifier: string }
        Returns: {
          id: string
          must_change_password: boolean
          organization_name: string
          organization_slug: string
          status: string
        }[]
      }
      record_workspace_save: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      resolve_workspace: {
        Args: { p_identifier: string }
        Returns: {
          name: string
          slug: string
        }[]
      }
      complete_first_login: {
        Args: { p_membership_id: string }
        Returns: undefined
      }
      provision_team_member: {
        Args: {
          p_department_ids: string[]
          p_display_name: string
          p_email: string
          p_job_title: string
          p_must_change_password?: boolean
          p_organization_id: string
          p_permission_keys: string[]
          p_role: string
          p_user_id: string
        }
        Returns: string
      }
      record_app_event: {
        Args: {
          p_action: string
          p_after_data?: Json | null
          p_department_id: string | null
          p_entity_id: string
          p_entity_type: string
          p_organization_id: string
        }
        Returns: number
      }
      revoke_team_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      set_department_primary_manager: {
        Args: { p_department_id: string; p_membership_id: string | null }
        Returns: undefined
      }
      update_team_member: {
        Args: {
          p_department_ids: string[]
          p_membership_id: string
          p_permission_keys: string[]
          p_role: string
          p_status: string
        }
        Returns: undefined
      }
      update_team_member_profile: {
        Args: {
          p_department_ids: string[]
          p_display_name: string
          p_job_title: string
          p_membership_id: string
          p_permission_keys: string[]
          p_role: string
          p_status: string
        }
        Returns: undefined
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
  public: {
    Enums: {},
  },
} as const
