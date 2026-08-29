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
      count_room_locks: {
        Row: {
          acquired_at: string
          count_id: string
          expires_at: string
          heartbeat_at: string
          holder_name: string
          organization_id: string
          room_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          count_id: string
          expires_at: string
          heartbeat_at?: string
          holder_name: string
          organization_id: string
          room_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          count_id?: string
          expires_at?: string
          heartbeat_at?: string
          holder_name?: string
          organization_id?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "count_room_locks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      departments: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          inventory_enabled: boolean
          location_id: string | null
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
          inventory_enabled?: boolean
          location_id?: string | null
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
          inventory_enabled?: boolean
          location_id?: string | null
          name?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_location_organization_fkey"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          attempt_count: number
          error: string | null
          event_type: string
          external_id: string | null
          id: number
          integration_id: string | null
          organization_id: string
          payload: Json
          processed_at: string | null
          processing_status: string
          provider: string
          received_at: string
          retained_until: string
        }
        Insert: {
          attempt_count?: number
          error?: string | null
          event_type: string
          external_id?: string | null
          id?: never
          integration_id?: string | null
          organization_id: string
          payload: Json
          processed_at?: string | null
          processing_status?: string
          provider: string
          received_at?: string
          retained_until?: string
        }
        Update: {
          attempt_count?: number
          error?: string | null
          event_type?: string
          external_id?: string | null
          id?: never
          integration_id?: string | null
          organization_id?: string
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          provider?: string
          received_at?: string
          retained_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "integration_events_organization_id_fkey"
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
      locations: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          inventory_enabled: boolean
          name: string
          organization_id: string
          region_id: string | null
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_enabled?: boolean
          name: string
          organization_id: string
          region_id?: string | null
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_enabled?: boolean
          name?: string
          organization_id?: string
          region_id?: string | null
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_region_id_organization_id_fkey"
            columns: ["region_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      membership_departments: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          is_primary: boolean
          membership_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          is_primary?: boolean
          membership_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          is_primary?: boolean
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
      membership_location_assignments: {
        Row: {
          authority: string
          created_at: string
          created_by: string | null
          is_primary: boolean
          location_id: string
          membership_id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          authority?: string
          created_at?: string
          created_by?: string | null
          is_primary?: boolean
          location_id: string
          membership_id: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          authority?: string
          created_at?: string
          created_by?: string | null
          is_primary?: boolean
          location_id?: string
          membership_id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_location_assignmen_membership_id_organization_i_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "membership_location_assignment_location_id_organization_id_fkey"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "organization_id"]
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
      membership_positions: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          is_primary: boolean
          location_id: string | null
          membership_id: string
          organization_id: string
          position_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          is_primary?: boolean
          location_id?: string | null
          membership_id: string
          organization_id: string
          position_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          is_primary?: boolean
          location_id?: string | null
          membership_id?: string
          organization_id?: string
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_positions_location_id_organization_id_fkey"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "membership_positions_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "membership_positions_position_id_organization_id_fkey"
            columns: ["position_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      membership_region_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          is_manager: boolean
          membership_id: string
          organization_id: string
          region_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          is_manager?: boolean
          membership_id: string
          organization_id: string
          region_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          is_manager?: boolean
          membership_id?: string
          organization_id?: string
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_region_assignments_membership_id_organization_i_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "membership_region_assignments_region_id_organization_id_fkey"
            columns: ["region_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      membership_reporting_lines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string | null
          membership_id: string
          organization_id: string
          supervisor_membership_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
          membership_id: string
          organization_id: string
          supervisor_membership_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
          membership_id?: string
          organization_id?: string
          supervisor_membership_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_reporting_lines_location_id_organization_id_fkey"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "membership_reporting_lines_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "membership_reporting_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_reporting_lines_supervisor_membership_id_organi_fkey"
            columns: ["supervisor_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "organization_id"]
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
      platform_administrators: {
        Row: {
          created_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pos_integrations: {
        Row: {
          configuration: Json
          connected_at: string | null
          created_at: string
          created_by: string | null
          id: string
          integration_type: string
          last_successful_sync_at: string | null
          last_sync_at: string | null
          mode: string
          organization_id: string
          provider: string
          status: string
          sync_error: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          configuration?: Json
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          integration_type?: string
          last_successful_sync_at?: string | null
          last_sync_at?: string | null
          mode?: string
          organization_id: string
          provider: string
          status?: string
          sync_error?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          configuration?: Json
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          integration_type?: string
          last_successful_sync_at?: string | null
          last_sync_at?: string | null
          mode?: string
          organization_id?: string
          provider?: string
          status?: string
          sync_error?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_item_mappings: {
        Row: {
          created_at: string
          external_item_id: string
          external_item_name: string
          id: string
          integration_id: string
          mapped_at: string | null
          mapped_by: string | null
          mapping_status: string
          month_end_menu_item_id: string | null
          month_end_menu_item_name: string | null
          month_end_menu_variant_key: string | null
          month_end_menu_variant_name: string | null
          organization_id: string
          pos_menu_item_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_item_id: string
          external_item_name: string
          id?: string
          integration_id: string
          mapped_at?: string | null
          mapped_by?: string | null
          mapping_status?: string
          month_end_menu_item_id?: string | null
          month_end_menu_item_name?: string | null
          month_end_menu_variant_key?: string | null
          month_end_menu_variant_name?: string | null
          organization_id: string
          pos_menu_item_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_item_id?: string
          external_item_name?: string
          id?: string
          integration_id?: string
          mapped_at?: string | null
          mapped_by?: string | null
          mapping_status?: string
          month_end_menu_item_id?: string | null
          month_end_menu_item_name?: string | null
          month_end_menu_variant_key?: string | null
          month_end_menu_variant_name?: string | null
          organization_id?: string
          pos_menu_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_item_mappings_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pos_item_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_item_mappings_pos_menu_item_id_organization_id_fkey"
            columns: ["pos_menu_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      pos_locations: {
        Row: {
          created_at: string
          external_location_id: string
          id: string
          integration_id: string
          last_successful_sync_at: string | null
          last_sync_at: string | null
          metadata: Json
          name: string
          organization_id: string
          status: string
          sync_error: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_location_id: string
          id?: string
          integration_id: string
          last_successful_sync_at?: string | null
          last_sync_at?: string | null
          metadata?: Json
          name: string
          organization_id: string
          status?: string
          sync_error?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_location_id?: string
          id?: string
          integration_id?: string
          last_successful_sync_at?: string | null
          last_sync_at?: string | null
          metadata?: Json
          name?: string
          organization_id?: string
          status?: string
          sync_error?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_locations_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pos_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_menu_items: {
        Row: {
          category: string | null
          currency: string | null
          external_item_id: string
          id: string
          imported_at: string
          integration_id: string
          is_active: boolean
          location_id: string
          name: string
          organization_id: string
          price: number | null
          sku: string | null
          source_updated_at: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          currency?: string | null
          external_item_id: string
          id?: string
          imported_at?: string
          integration_id: string
          is_active?: boolean
          location_id: string
          name: string
          organization_id: string
          price?: number | null
          sku?: string | null
          source_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          currency?: string | null
          external_item_id?: string
          id?: string
          imported_at?: string
          integration_id?: string
          is_active?: boolean
          location_id?: string
          name?: string
          organization_id?: string
          price?: number | null
          sku?: string | null
          source_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_menu_items_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pos_menu_items_location_id_organization_id_fkey"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_locations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pos_menu_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sync_runs: {
        Row: {
          completed_at: string | null
          details: Json
          error: string | null
          id: string
          integration_id: string
          location_id: string | null
          organization_id: string
          range_end: string | null
          range_start: string | null
          records_created: number
          records_received: number
          records_skipped: number
          records_updated: number
          started_at: string
          status: string
          sync_kind: string
          trigger_type: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          details?: Json
          error?: string | null
          id?: string
          integration_id: string
          location_id?: string | null
          organization_id: string
          range_end?: string | null
          range_start?: string | null
          records_created?: number
          records_received?: number
          records_skipped?: number
          records_updated?: number
          started_at?: string
          status?: string
          sync_kind: string
          trigger_type: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          details?: Json
          error?: string | null
          id?: string
          integration_id?: string
          location_id?: string | null
          organization_id?: string
          range_end?: string | null
          range_start?: string | null
          records_created?: number
          records_received?: number
          records_skipped?: number
          records_updated?: number
          started_at?: string
          status?: string
          sync_kind?: string
          trigger_type?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sync_runs_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pos_sync_runs_location_id_organization_id_fkey"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_locations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pos_sync_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_ticket_items: {
        Row: {
          created_at: string
          external_menu_item_id: string | null
          external_ticket_item_id: string
          id: string
          integration_id: string
          is_cancelled: boolean
          is_voided: boolean
          modifiers: Json
          name: string
          organization_id: string
          pos_menu_item_id: string | null
          quantity: number
          ticket_id: string
          total: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_menu_item_id?: string | null
          external_ticket_item_id: string
          id?: string
          integration_id: string
          is_cancelled?: boolean
          is_voided?: boolean
          modifiers?: Json
          name: string
          organization_id: string
          pos_menu_item_id?: string | null
          quantity: number
          ticket_id: string
          total?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_menu_item_id?: string | null
          external_ticket_item_id?: string
          id?: string
          integration_id?: string
          is_cancelled?: boolean
          is_voided?: boolean
          modifiers?: Json
          name?: string
          organization_id?: string
          pos_menu_item_id?: string | null
          quantity?: number
          ticket_id?: string
          total?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_ticket_items_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pos_ticket_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_ticket_items_pos_menu_item_id_organization_id_fkey"
            columns: ["pos_menu_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pos_ticket_items_ticket_id_organization_id_fkey"
            columns: ["ticket_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_tickets"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      pos_tickets: {
        Row: {
          closed_at: string | null
          content_hash: string
          currency: string | null
          employee_name: string | null
          external_employee_id: string | null
          external_ticket_id: string
          guest_count: number | null
          id: string
          imported_at: string
          integration_id: string
          location_id: string
          opened_at: string | null
          organization_id: string
          source_updated_at: string | null
          status: string
          subtotal: number | null
          ticket_number: string | null
          total: number | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          content_hash: string
          currency?: string | null
          employee_name?: string | null
          external_employee_id?: string | null
          external_ticket_id: string
          guest_count?: number | null
          id?: string
          imported_at?: string
          integration_id: string
          location_id: string
          opened_at?: string | null
          organization_id: string
          source_updated_at?: string | null
          status: string
          subtotal?: number | null
          ticket_number?: string | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          content_hash?: string
          currency?: string | null
          employee_name?: string | null
          external_employee_id?: string | null
          external_ticket_id?: string
          guest_count?: number | null
          id?: string
          imported_at?: string
          integration_id?: string
          location_id?: string
          opened_at?: string | null
          organization_id?: string
          source_updated_at?: string | null
          status?: string
          subtotal?: number | null
          ticket_number?: string | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_tickets_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pos_tickets_location_id_organization_id_fkey"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pos_locations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pos_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      position_departments: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          is_primary: boolean
          position_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          is_primary?: boolean
          position_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          is_primary?: boolean
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_departments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      position_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          created_by: string | null
          permission_key: string
          position_id: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          created_by?: string | null
          permission_key: string
          position_id: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          created_by?: string | null
          permission_key?: string
          position_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "position_permissions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          archived_at: string | null
          can_manage_people: boolean
          created_at: string
          created_by: string | null
          description: string
          id: string
          location_id: string | null
          name: string
          organization_id: string
          region_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          can_manage_people?: boolean
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          location_id?: string | null
          name: string
          organization_id: string
          region_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          can_manage_people?: boolean
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          location_id?: string | null
          name?: string
          organization_id?: string
          region_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_location_id_organization_id_fkey"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "positions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_region_id_organization_id_fkey"
            columns: ["region_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
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
      regions: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_team_invitation: {
        Args: { p_token_hash: string }
        Returns: string
      }
      acquire_count_room_lock: {
        Args: {
          p_count_id: string
          p_organization_id: string
          p_room_id: string
        }
        Returns: {
          acquired: boolean
          expires_at: string
          holder_name: string
          user_id: string
        }[]
      }
      complete_first_login: {
        Args: { p_membership_id: string }
        Returns: undefined
      }
      create_position: {
        Args: {
          p_can_manage_people?: boolean
          p_department_ids?: string[]
          p_description?: string
          p_location_id?: string | null
          p_name: string
          p_organization_id: string
          p_permission_keys?: string[]
          p_primary_department_id?: string | null
          p_region_id?: string | null
        }
        Returns: string
      }
      create_restaurant_workspace: {
        Args: { p_name: string; p_owner_user_id: string; p_slug: string }
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
      get_my_effective_access: {
        Args: { p_organization_id: string }
        Returns: {
          can_manage_people: boolean
          department_ids: string[]
          location_ids: string[]
          membership_id: string
          permission_keys: string[]
          position_ids: string[]
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
      record_workspace_save: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      release_count_room_lock: {
        Args: {
          p_count_id: string
          p_organization_id: string
          p_room_id: string
        }
        Returns: boolean
      }
      resolve_workspace: {
        Args: { p_identifier: string }
        Returns: {
          name: string
          slug: string
        }[]
      }
      revoke_team_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      set_department_primary_manager: {
        Args: { p_department_id: string; p_membership_id: string | null }
        Returns: undefined
      }
      set_member_structure: {
        Args: {
          p_department_ids?: string[]
          p_location_ids?: string[]
          p_membership_id: string
          p_position_ids?: string[]
          p_primary_department_id?: string | null
          p_primary_location_id?: string | null
          p_primary_position_id?: string | null
          p_supervisor_membership_id?: string | null
        }
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
