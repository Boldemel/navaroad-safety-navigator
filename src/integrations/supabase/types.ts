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
      ai_chat_messages: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
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
      companies: {
        Row: {
          billing_customer_id: string | null
          billing_provider: string | null
          billing_subscription_id: string | null
          cancelled_at: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          payment_method_brand: string | null
          payment_method_last4: string | null
          payment_method_on_file: boolean
          plan_end_date: string | null
          plan_start_date: string
          reactivated_at: string | null
          read_only_at: string | null
          subscription_plan: Database["public"]["Enums"]["subscription_plan"]
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          billing_customer_id?: string | null
          billing_provider?: string | null
          billing_subscription_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          payment_method_on_file?: boolean
          plan_end_date?: string | null
          plan_start_date?: string
          reactivated_at?: string | null
          read_only_at?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_customer_id?: string | null
          billing_provider?: string | null
          billing_subscription_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          payment_method_on_file?: boolean
          plan_end_date?: string | null
          plan_start_date?: string
          reactivated_at?: string | null
          read_only_at?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_member_permission_overrides: {
        Row: {
          created_at: string
          granted: boolean
          member_id: string
          permission: Database["public"]["Enums"]["app_permission"]
        }
        Insert: {
          created_at?: string
          granted: boolean
          member_id: string
          permission: Database["public"]["Enums"]["app_permission"]
        }
        Update: {
          created_at?: string
          granted?: boolean
          member_id?: string
          permission?: Database["public"]["Enums"]["app_permission"]
        }
        Relationships: [
          {
            foreignKeyName: "company_member_permission_overrides_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      company_member_roles: {
        Row: {
          created_at: string
          member_id: string
          role: Database["public"]["Enums"]["company_role"]
        }
        Insert: {
          created_at?: string
          member_id: string
          role: Database["public"]["Enums"]["company_role"]
        }
        Update: {
          created_at?: string
          member_id?: string
          role?: Database["public"]["Enums"]["company_role"]
        }
        Relationships: [
          {
            foreignKeyName: "company_member_roles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string | null
          company_id: string
          created_at: string
          doc_number: string | null
          doc_type: string
          driver_id: string | null
          expires_on: string | null
          file_url: string | null
          id: string
          issued_on: string | null
          issuer: string | null
          notes: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          company_id: string
          created_at?: string
          doc_number?: string | null
          doc_type: string
          driver_id?: string | null
          expires_on?: string | null
          file_url?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          notes?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          company_id?: string
          created_at?: string
          doc_number?: string | null
          doc_type?: string
          driver_id?: string | null
          expires_on?: string | null
          file_url?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          notes?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_eld_credentials: {
        Row: {
          company_id: string
          created_at: string
          created_by_user_id: string | null
          eld_password: string | null
          eld_system: string | null
          eld_user_id: string | null
          id: string
          updated_at: string
          user_id: string
          visible_to_driver: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by_user_id?: string | null
          eld_password?: string | null
          eld_system?: string | null
          eld_user_id?: string | null
          id?: string
          updated_at?: string
          user_id: string
          visible_to_driver?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by_user_id?: string | null
          eld_password?: string | null
          eld_system?: string | null
          eld_user_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          visible_to_driver?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "driver_eld_credentials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_status_logs: {
        Row: {
          company_id: string
          created_at: string
          ended_at: string | null
          id: string
          location: string | null
          notes: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
          vehicle_unit: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          started_at: string
          status: string
          updated_at?: string
          user_id: string
          vehicle_unit?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
          vehicle_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duty_status_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      expenses: {
        Row: {
          amount_usd: number
          category: string
          company_id: string
          created_at: string
          driver_id: string | null
          expense_date: string
          fuel_purchase_id: string | null
          id: string
          load_id: string | null
          maintenance_record_id: string | null
          notes: string | null
          receipt_url: string | null
          state_code: string | null
          trip_log_id: string | null
          updated_at: string
          user_id: string
          vehicle_unit: string | null
          vendor: string | null
        }
        Insert: {
          amount_usd?: number
          category: string
          company_id: string
          created_at?: string
          driver_id?: string | null
          expense_date?: string
          fuel_purchase_id?: string | null
          id?: string
          load_id?: string | null
          maintenance_record_id?: string | null
          notes?: string | null
          receipt_url?: string | null
          state_code?: string | null
          trip_log_id?: string | null
          updated_at?: string
          user_id: string
          vehicle_unit?: string | null
          vendor?: string | null
        }
        Update: {
          amount_usd?: number
          category?: string
          company_id?: string
          created_at?: string
          driver_id?: string | null
          expense_date?: string
          fuel_purchase_id?: string | null
          id?: string
          load_id?: string | null
          maintenance_record_id?: string | null
          notes?: string | null
          receipt_url?: string | null
          state_code?: string | null
          trip_log_id?: string | null
          updated_at?: string
          user_id?: string
          vehicle_unit?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_fuel_purchase_id_fkey"
            columns: ["fuel_purchase_id"]
            isOneToOne: false
            referencedRelation: "fuel_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_cost_allocation"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "expenses_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_miles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "expenses_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_profitability"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "expenses_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_log_id_fkey"
            columns: ["trip_log_id"]
            isOneToOne: false
            referencedRelation: "trip_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_locations: {
        Row: {
          address: string
          category: string
          city: string | null
          company_id: string
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
          company_id: string
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
          company_id?: string
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
        Relationships: [
          {
            foreignKeyName: "favorite_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_purchases: {
        Row: {
          company_id: string
          created_at: string
          driver_id: string | null
          gallons: number
          id: string
          load_id: string | null
          notes: string | null
          odometer: number | null
          price_per_gallon: number
          purchase_date: string
          receipt_url: string | null
          state_code: string
          station_name: string | null
          total_cost_usd: number
          trip_log_id: string | null
          updated_at: string
          user_id: string
          vehicle_unit: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          driver_id?: string | null
          gallons?: number
          id?: string
          load_id?: string | null
          notes?: string | null
          odometer?: number | null
          price_per_gallon?: number
          purchase_date?: string
          receipt_url?: string | null
          state_code: string
          station_name?: string | null
          total_cost_usd?: number
          trip_log_id?: string | null
          updated_at?: string
          user_id: string
          vehicle_unit?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          driver_id?: string | null
          gallons?: number
          id?: string
          load_id?: string | null
          notes?: string | null
          odometer?: number | null
          price_per_gallon?: number
          purchase_date?: string
          receipt_url?: string | null
          state_code?: string
          station_name?: string | null
          total_cost_usd?: number
          trip_log_id?: string | null
          updated_at?: string
          user_id?: string
          vehicle_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_purchases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_purchases_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_cost_allocation"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "fuel_purchases_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_miles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "fuel_purchases_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_profitability"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "fuel_purchases_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_purchases_trip_log_id_fkey"
            columns: ["trip_log_id"]
            isOneToOne: false
            referencedRelation: "trip_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      hazard_reports: {
        Row: {
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "hazard_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      ifta_entries: {
        Row: {
          company_id: string
          created_at: string
          driver_id: string | null
          entry_date: string
          fuel_cost_usd: number | null
          fuel_gallons: number
          fuel_purchase_id: string | null
          id: string
          load_id: string | null
          miles: number
          notes: string | null
          state_code: string
          trip_log_id: string | null
          user_id: string
          vehicle_unit: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          driver_id?: string | null
          entry_date?: string
          fuel_cost_usd?: number | null
          fuel_gallons?: number
          fuel_purchase_id?: string | null
          id?: string
          load_id?: string | null
          miles?: number
          notes?: string | null
          state_code: string
          trip_log_id?: string | null
          user_id: string
          vehicle_unit?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          driver_id?: string | null
          entry_date?: string
          fuel_cost_usd?: number | null
          fuel_gallons?: number
          fuel_purchase_id?: string | null
          id?: string
          load_id?: string | null
          miles?: number
          notes?: string | null
          state_code?: string
          trip_log_id?: string | null
          user_id?: string
          vehicle_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ifta_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ifta_entries_fuel_purchase_id_fkey"
            columns: ["fuel_purchase_id"]
            isOneToOne: false
            referencedRelation: "fuel_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ifta_entries_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_cost_allocation"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "ifta_entries_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_miles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "ifta_entries_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_profitability"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "ifta_entries_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          company_id: string
          created_at: string
          defects: Json
          defects_correction_required: boolean
          driver_id: string | null
          id: string
          inspection_type: string
          notes: string | null
          odometer: number | null
          signature: string | null
          trailer_unit: string | null
          user_id: string
          vehicle_unit: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          defects?: Json
          defects_correction_required?: boolean
          driver_id?: string | null
          id?: string
          inspection_type?: string
          notes?: string | null
          odometer?: number | null
          signature?: string | null
          trailer_unit?: string | null
          user_id: string
          vehicle_unit?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          defects?: Json
          defects_correction_required?: boolean
          driver_id?: string | null
          id?: string
          inspection_type?: string
          notes?: string | null
          odometer?: number | null
          signature?: string | null
          trailer_unit?: string | null
          user_id?: string
          vehicle_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      loads: {
        Row: {
          bol_number: string | null
          commodity: string | null
          company_id: string
          consignee_address: string | null
          consignee_name: string | null
          created_at: string
          delivery_at: string | null
          driver_id: string | null
          empty_miles: number | null
          id: string
          is_current: boolean
          loaded_miles: number | null
          notes: string | null
          pickup_at: string | null
          rate_usd: number | null
          shipper_address: string | null
          shipper_name: string | null
          status: string
          total_miles: number | null
          updated_at: string
          user_id: string
          vehicle_unit: string | null
          weight_lbs: number | null
        }
        Insert: {
          bol_number?: string | null
          commodity?: string | null
          company_id: string
          consignee_address?: string | null
          consignee_name?: string | null
          created_at?: string
          delivery_at?: string | null
          driver_id?: string | null
          empty_miles?: number | null
          id?: string
          is_current?: boolean
          loaded_miles?: number | null
          notes?: string | null
          pickup_at?: string | null
          rate_usd?: number | null
          shipper_address?: string | null
          shipper_name?: string | null
          status?: string
          total_miles?: number | null
          updated_at?: string
          user_id: string
          vehicle_unit?: string | null
          weight_lbs?: number | null
        }
        Update: {
          bol_number?: string | null
          commodity?: string | null
          company_id?: string
          consignee_address?: string | null
          consignee_name?: string | null
          created_at?: string
          delivery_at?: string | null
          driver_id?: string | null
          empty_miles?: number | null
          id?: string
          is_current?: boolean
          loaded_miles?: number | null
          notes?: string | null
          pickup_at?: string | null
          rate_usd?: number | null
          shipper_address?: string | null
          shipper_name?: string | null
          status?: string
          total_miles?: number | null
          updated_at?: string
          user_id?: string
          vehicle_unit?: string | null
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_records: {
        Row: {
          company_id: string
          cost_usd: number | null
          created_at: string
          driver_id: string | null
          id: string
          next_due_date: string | null
          next_due_odometer: number | null
          notes: string | null
          odometer: number | null
          receipt_url: string | null
          service_date: string
          service_type: string
          updated_at: string
          user_id: string
          vehicle_unit: string | null
          vendor: string | null
        }
        Insert: {
          company_id: string
          cost_usd?: number | null
          created_at?: string
          driver_id?: string | null
          id?: string
          next_due_date?: string | null
          next_due_odometer?: number | null
          notes?: string | null
          odometer?: number | null
          receipt_url?: string | null
          service_date?: string
          service_type: string
          updated_at?: string
          user_id: string
          vehicle_unit?: string | null
          vendor?: string | null
        }
        Update: {
          company_id?: string
          cost_usd?: number | null
          created_at?: string
          driver_id?: string | null
          id?: string
          next_due_date?: string | null
          next_due_odometer?: number | null
          notes?: string | null
          odometer?: number | null
          receipt_url?: string | null
          service_date?: string
          service_type?: string
          updated_at?: string
          user_id?: string
          vehicle_unit?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tasks: {
        Row: {
          assigned_to: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          defect_category: string | null
          defect_description: string
          defect_key: string | null
          driver_id: string | null
          id: string
          inspection_id: string | null
          maintenance_record_id: string | null
          priority: Database["public"]["Enums"]["maintenance_task_priority"]
          repair_cost_usd: number | null
          repair_documentation_url: string | null
          repair_notes: string | null
          status: Database["public"]["Enums"]["maintenance_task_status"]
          trailer_unit: string | null
          updated_at: string
          user_id: string
          vehicle_unit: string | null
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          defect_category?: string | null
          defect_description: string
          defect_key?: string | null
          driver_id?: string | null
          id?: string
          inspection_id?: string | null
          maintenance_record_id?: string | null
          priority?: Database["public"]["Enums"]["maintenance_task_priority"]
          repair_cost_usd?: number | null
          repair_documentation_url?: string | null
          repair_notes?: string | null
          status?: Database["public"]["Enums"]["maintenance_task_status"]
          trailer_unit?: string | null
          updated_at?: string
          user_id: string
          vehicle_unit?: string | null
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          defect_category?: string | null
          defect_description?: string
          defect_key?: string | null
          driver_id?: string | null
          id?: string
          inspection_id?: string | null
          maintenance_record_id?: string | null
          priority?: Database["public"]["Enums"]["maintenance_task_priority"]
          repair_cost_usd?: number | null
          repair_documentation_url?: string | null
          repair_notes?: string | null
          status?: Database["public"]["Enums"]["maintenance_task_status"]
          trailer_unit?: string | null
          updated_at?: string
          user_id?: string
          vehicle_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tasks_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tasks_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_feature_access: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          notes: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          updated_at: string
          usage_limit: number | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          notes?: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          updated_at?: string
          usage_limit?: number | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          notes?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          updated_at?: string
          usage_limit?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          assigned_trailer: string | null
          assigned_truck: string | null
          created_at: string
          created_by_user_id: string | null
          driver_id_number: string | null
          driver_name: string | null
          driver_pay_model: string | null
          driver_pay_rate: number | null
          eld_system: string | null
          employee_id: string | null
          first_name: string | null
          id: string
          last_name: string | null
          load_status: string | null
          must_change_password: boolean
          notify_email: boolean | null
          notify_push: boolean | null
          notify_sms: boolean | null
          phone: string | null
          trailer_insurance_expiry: string | null
          trailer_make: string | null
          trailer_plate: string | null
          trailer_plate_state: string | null
          trailer_registration_expiry: string | null
          trailer_type: string | null
          trailer_vin: string | null
          trailer_year: number | null
          truck_axles: number | null
          truck_hazmat: boolean
          truck_height_in: number | null
          truck_insurance_carrier: string | null
          truck_insurance_expiry: string | null
          truck_insurance_policy: string | null
          truck_length_ft: number | null
          truck_make: string | null
          truck_model: string | null
          truck_plate: string | null
          truck_plate_state: string | null
          truck_registration_expiry: string | null
          truck_type: string | null
          truck_vin: string | null
          truck_weight_lbs: number | null
          truck_year: number | null
          updated_at: string
          username: string | null
        }
        Insert: {
          active?: boolean
          assigned_trailer?: string | null
          assigned_truck?: string | null
          created_at?: string
          created_by_user_id?: string | null
          driver_id_number?: string | null
          driver_name?: string | null
          driver_pay_model?: string | null
          driver_pay_rate?: number | null
          eld_system?: string | null
          employee_id?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          load_status?: string | null
          must_change_password?: boolean
          notify_email?: boolean | null
          notify_push?: boolean | null
          notify_sms?: boolean | null
          phone?: string | null
          trailer_insurance_expiry?: string | null
          trailer_make?: string | null
          trailer_plate?: string | null
          trailer_plate_state?: string | null
          trailer_registration_expiry?: string | null
          trailer_type?: string | null
          trailer_vin?: string | null
          trailer_year?: number | null
          truck_axles?: number | null
          truck_hazmat?: boolean
          truck_height_in?: number | null
          truck_insurance_carrier?: string | null
          truck_insurance_expiry?: string | null
          truck_insurance_policy?: string | null
          truck_length_ft?: number | null
          truck_make?: string | null
          truck_model?: string | null
          truck_plate?: string | null
          truck_plate_state?: string | null
          truck_registration_expiry?: string | null
          truck_type?: string | null
          truck_vin?: string | null
          truck_weight_lbs?: number | null
          truck_year?: number | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          active?: boolean
          assigned_trailer?: string | null
          assigned_truck?: string | null
          created_at?: string
          created_by_user_id?: string | null
          driver_id_number?: string | null
          driver_name?: string | null
          driver_pay_model?: string | null
          driver_pay_rate?: number | null
          eld_system?: string | null
          employee_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          load_status?: string | null
          must_change_password?: boolean
          notify_email?: boolean | null
          notify_push?: boolean | null
          notify_sms?: boolean | null
          phone?: string | null
          trailer_insurance_expiry?: string | null
          trailer_make?: string | null
          trailer_plate?: string | null
          trailer_plate_state?: string | null
          trailer_registration_expiry?: string | null
          trailer_type?: string | null
          trailer_vin?: string | null
          trailer_year?: number | null
          truck_axles?: number | null
          truck_hazmat?: boolean
          truck_height_in?: number | null
          truck_insurance_carrier?: string | null
          truck_insurance_expiry?: string | null
          truck_insurance_policy?: string | null
          truck_length_ft?: number | null
          truck_make?: string | null
          truck_model?: string | null
          truck_plate?: string | null
          truck_plate_state?: string | null
          truck_registration_expiry?: string | null
          truck_type?: string | null
          truck_vin?: string | null
          truck_weight_lbs?: number | null
          truck_year?: number | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      role_default_permissions: {
        Row: {
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["company_role"]
        }
        Insert: {
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["company_role"]
        }
        Update: {
          permission?: Database["public"]["Enums"]["app_permission"]
          role?: Database["public"]["Enums"]["company_role"]
        }
        Relationships: []
      }
      saved_routes: {
        Row: {
          company_id: string
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
          company_id: string
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
          company_id?: string
          created_at?: string
          destination?: string
          id?: string
          origin?: string
          safety_score?: number | null
          trailer_type?: string | null
          truck_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_routes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          cash_advances_usd: number
          company_id: string
          created_at: string
          customer: string | null
          deduction_notes: string | null
          deductions_usd: number
          delivery_date: string | null
          destination: string | null
          detention_usd: number
          driver_id: string | null
          fuel_advances_usd: number
          fuel_surcharge_usd: number
          gross_pay_usd: number
          gross_revenue_usd: number | null
          id: string
          layover_usd: number
          linehaul_revenue_usd: number
          load_id: string | null
          lumper_reimbursement_usd: number
          miles: number | null
          net_settlement_usd: number | null
          notes: string | null
          origin: string | null
          other_deductions_usd: number
          other_revenue_usd: number
          payer: string | null
          rate_per_mile: number | null
          reference_number: string | null
          repairs_usd: number
          scale_tickets_usd: number
          settlement_date: string
          status: string
          tolls_usd: number
          total_deductions_usd: number | null
          updated_at: string
          user_id: string
          vehicle_unit: string | null
        }
        Insert: {
          cash_advances_usd?: number
          company_id: string
          created_at?: string
          customer?: string | null
          deduction_notes?: string | null
          deductions_usd?: number
          delivery_date?: string | null
          destination?: string | null
          detention_usd?: number
          driver_id?: string | null
          fuel_advances_usd?: number
          fuel_surcharge_usd?: number
          gross_pay_usd?: number
          gross_revenue_usd?: number | null
          id?: string
          layover_usd?: number
          linehaul_revenue_usd?: number
          load_id?: string | null
          lumper_reimbursement_usd?: number
          miles?: number | null
          net_settlement_usd?: number | null
          notes?: string | null
          origin?: string | null
          other_deductions_usd?: number
          other_revenue_usd?: number
          payer?: string | null
          rate_per_mile?: number | null
          reference_number?: string | null
          repairs_usd?: number
          scale_tickets_usd?: number
          settlement_date?: string
          status?: string
          tolls_usd?: number
          total_deductions_usd?: number | null
          updated_at?: string
          user_id: string
          vehicle_unit?: string | null
        }
        Update: {
          cash_advances_usd?: number
          company_id?: string
          created_at?: string
          customer?: string | null
          deduction_notes?: string | null
          deductions_usd?: number
          delivery_date?: string | null
          destination?: string | null
          detention_usd?: number
          driver_id?: string | null
          fuel_advances_usd?: number
          fuel_surcharge_usd?: number
          gross_pay_usd?: number
          gross_revenue_usd?: number | null
          id?: string
          layover_usd?: number
          linehaul_revenue_usd?: number
          load_id?: string | null
          lumper_reimbursement_usd?: number
          miles?: number | null
          net_settlement_usd?: number | null
          notes?: string | null
          origin?: string | null
          other_deductions_usd?: number
          other_revenue_usd?: number
          payer?: string | null
          rate_per_mile?: number | null
          reference_number?: string | null
          repairs_usd?: number
          scale_tickets_usd?: number
          settlement_date?: string
          status?: string
          tolls_usd?: number
          total_deductions_usd?: number | null
          updated_at?: string
          user_id?: string
          vehicle_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_cost_allocation"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "settlements_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_miles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "settlements_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_profitability"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "settlements_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          annual_price_usd: number
          created_at: string
          description: string | null
          display_name: string
          features: Json
          id: string
          is_active: boolean
          monthly_price_usd: number
          plan: Database["public"]["Enums"]["subscription_plan"]
          sort_order: number
          stripe_annual_price_id: string | null
          stripe_monthly_price_id: string | null
          stripe_product_id: string | null
          truck_limit: number | null
          updated_at: string
          user_limit: number | null
        }
        Insert: {
          annual_price_usd?: number
          created_at?: string
          description?: string | null
          display_name: string
          features?: Json
          id?: string
          is_active?: boolean
          monthly_price_usd?: number
          plan: Database["public"]["Enums"]["subscription_plan"]
          sort_order?: number
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          stripe_product_id?: string | null
          truck_limit?: number | null
          updated_at?: string
          user_limit?: number | null
        }
        Update: {
          annual_price_usd?: number
          created_at?: string
          description?: string | null
          display_name?: string
          features?: Json
          id?: string
          is_active?: boolean
          monthly_price_usd?: number
          plan?: Database["public"]["Enums"]["subscription_plan"]
          sort_order?: number
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          stripe_product_id?: string | null
          truck_limit?: number | null
          updated_at?: string
          user_limit?: number | null
        }
        Relationships: []
      }
      super_admin_impersonation_log: {
        Row: {
          admin_user_id: string
          ended_at: string | null
          id: string
          reason: string | null
          started_at: string
          target_company_id: string
        }
        Insert: {
          admin_user_id: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          started_at?: string
          target_company_id: string
        }
        Update: {
          admin_user_id?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          started_at?: string
          target_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "super_admin_impersonation_log_target_company_id_fkey"
            columns: ["target_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          admin_notes: string | null
          body: string
          company_id: string | null
          created_at: string
          id: string
          priority: string
          requester_user_id: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          body: string
          company_id?: string | null
          created_at?: string
          id?: string
          priority?: string
          requester_user_id: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          body?: string
          company_id?: string | null
          created_at?: string
          id?: string
          priority?: string
          requester_user_id?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      team_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          company_id: string
          created_at: string
          details: Json
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_logs: {
        Row: {
          company_id: string
          completed_at: string
          created_at: string
          destination: string
          distance_mi: number | null
          duration_min: number | null
          fuel_cost: number | null
          hazard_count: number | null
          id: string
          load_id: string | null
          notes: string | null
          origin: string
          route_date: string | null
          safety_score: number | null
          started_at: string | null
          state_mileage: Json | null
          trailer_type: string | null
          truck_type: string | null
          user_id: string
          vehicle_unit: string | null
          weather_alerts: number | null
        }
        Insert: {
          company_id: string
          completed_at?: string
          created_at?: string
          destination: string
          distance_mi?: number | null
          duration_min?: number | null
          fuel_cost?: number | null
          hazard_count?: number | null
          id?: string
          load_id?: string | null
          notes?: string | null
          origin: string
          route_date?: string | null
          safety_score?: number | null
          started_at?: string | null
          state_mileage?: Json | null
          trailer_type?: string | null
          truck_type?: string | null
          user_id: string
          vehicle_unit?: string | null
          weather_alerts?: number | null
        }
        Update: {
          company_id?: string
          completed_at?: string
          created_at?: string
          destination?: string
          distance_mi?: number | null
          duration_min?: number | null
          fuel_cost?: number | null
          hazard_count?: number | null
          id?: string
          load_id?: string | null
          notes?: string | null
          origin?: string
          route_date?: string | null
          safety_score?: number | null
          started_at?: string | null
          state_mileage?: Json | null
          trailer_type?: string | null
          truck_type?: string | null
          user_id?: string
          vehicle_unit?: string | null
          weather_alerts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_logs_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_cost_allocation"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "trip_logs_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_miles"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "trip_logs_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "load_profitability"
            referencedColumns: ["load_id"]
          },
          {
            foreignKeyName: "trip_logs_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
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
      weigh_station_status: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          latitude: number
          longitude: number
          reporter_id: string
          station_id: string
          station_name: string | null
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          latitude: number
          longitude: number
          reporter_id: string
          station_id: string
          station_name?: string | null
          status: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          latitude?: number
          longitude?: number
          reporter_id?: string
          station_id?: string
          station_name?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      company_profitability: {
        Row: {
          company_id: string | null
          cost_per_mile: number | null
          day: string | null
          driver_pay_usd: number | null
          fuel_cost_usd: number | null
          gross_revenue_usd: number | null
          maintenance_cost_usd: number | null
          miles: number | null
          net_profit_usd: number | null
          other_expenses_usd: number | null
          profit_margin: number | null
          profit_per_mile: number | null
          revenue_per_mile: number | null
          total_expenses_usd: number | null
        }
        Relationships: []
      }
      driver_profitability: {
        Row: {
          company_id: string | null
          driver_id: string | null
          expenses_usd: number | null
          fuel_cost_usd: number | null
          loads_completed: number | null
          miles: number | null
          net_profit_usd: number | null
          revenue_per_mile: number | null
          revenue_usd: number | null
        }
        Relationships: []
      }
      load_cost_allocation: {
        Row: {
          allocated_unassigned_usd: number | null
          company_id: string | null
          fuel_cost_usd: number | null
          load_id: string | null
          maintenance_cost_usd: number | null
          miles: number | null
          other_expenses_usd: number | null
          scale_tickets_usd: number | null
          tolls_usd: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      load_miles: {
        Row: {
          company_id: string | null
          load_id: string | null
          miles: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      load_profitability: {
        Row: {
          company_id: string | null
          consignee_name: string | null
          cost_per_mile: number | null
          delivery_at: string | null
          detention_usd: number | null
          driver_id: string | null
          driver_pay_usd: number | null
          fuel_cost_usd: number | null
          fuel_surcharge_usd: number | null
          gross_revenue_usd: number | null
          layover_usd: number | null
          linehaul_revenue_usd: number | null
          load_id: string | null
          lumper_reimbursement_usd: number | null
          maintenance_cost_usd: number | null
          miles: number | null
          net_profit_usd: number | null
          other_expenses_usd: number | null
          other_revenue_usd: number | null
          profit_per_mile: number | null
          revenue_per_mile: number | null
          scale_tickets_usd: number | null
          shipper_name: string | null
          status: string | null
          tolls_usd: number | null
          total_costs_usd: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_lifetime_costs: {
        Row: {
          company_id: string | null
          fuel_total_usd: number | null
          maintenance_total_usd: number | null
          repairs_total_usd: number | null
          tolls_total_usd: number | null
          total_costs_usd: number | null
          vehicle_unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_profitability: {
        Row: {
          company_id: string | null
          cost_per_mile: number | null
          day: string | null
          driver_pay_usd: number | null
          fuel_cost_usd: number | null
          maintenance_cost_usd: number | null
          miles: number | null
          net_profit_usd: number | null
          profit_per_mile: number | null
          revenue_per_mile: number | null
          revenue_usd: number | null
          total_expenses_usd: number | null
          vehicle_unit: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_manage_user: {
        Args: { _manager: string; _target: string }
        Returns: boolean
      }
      company_has_feature: {
        Args: { _company: string; _feature: string }
        Returns: boolean
      }
      current_trial_days_remaining: {
        Args: { _company: string }
        Returns: number
      }
      delete_current_user: { Args: never; Returns: undefined }
      get_user_company: { Args: { _user: string }; Returns: string }
      has_company_permission: {
        Args: {
          _company: string
          _permission: Database["public"]["Enums"]["app_permission"]
          _user: string
        }
        Returns: boolean
      }
      has_company_role: {
        Args: {
          _company: string
          _role: Database["public"]["Enums"]["company_role"]
          _user: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company: string; _user: string }
        Returns: boolean
      }
      is_company_owner: {
        Args: { _company: string; _user: string }
        Returns: boolean
      }
      is_company_read_only: { Args: { _company: string }; Returns: boolean }
      is_super_admin: { Args: { _user: string }; Returns: boolean }
      shares_company_with: {
        Args: { _target: string; _viewer: string }
        Returns: boolean
      }
    }
    Enums: {
      app_permission:
        | "company.manage"
        | "members.manage"
        | "loads.manage"
        | "loads.view"
        | "routes.manage"
        | "routes.view"
        | "inspections.manage"
        | "inspections.view"
        | "maintenance.manage"
        | "maintenance.view"
        | "documents.manage"
        | "documents.view"
        | "fuel.manage"
        | "fuel.view"
        | "expenses.manage"
        | "expenses.view"
        | "ifta.manage"
        | "ifta.view"
        | "hos.manage"
        | "hos.view"
        | "drive"
      app_role: "admin" | "moderator" | "user" | "super_admin"
      company_role:
        | "fleet_owner"
        | "dispatcher"
        | "safety_manager"
        | "maintenance_manager"
        | "driver"
        | "accountant"
        | "company_owner"
        | "fleet_manager"
      maintenance_task_priority: "Critical" | "High" | "Medium" | "Low"
      maintenance_task_status: "Open" | "InProgress" | "Completed" | "Cancelled"
      subscription_plan:
        | "owner_operator"
        | "small_fleet"
        | "growth_fleet"
        | "enterprise"
      subscription_status:
        | "trial"
        | "active"
        | "past_due"
        | "suspended"
        | "cancelled"
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
      app_permission: [
        "company.manage",
        "members.manage",
        "loads.manage",
        "loads.view",
        "routes.manage",
        "routes.view",
        "inspections.manage",
        "inspections.view",
        "maintenance.manage",
        "maintenance.view",
        "documents.manage",
        "documents.view",
        "fuel.manage",
        "fuel.view",
        "expenses.manage",
        "expenses.view",
        "ifta.manage",
        "ifta.view",
        "hos.manage",
        "hos.view",
        "drive",
      ],
      app_role: ["admin", "moderator", "user", "super_admin"],
      company_role: [
        "fleet_owner",
        "dispatcher",
        "safety_manager",
        "maintenance_manager",
        "driver",
        "accountant",
        "company_owner",
        "fleet_manager",
      ],
      maintenance_task_priority: ["Critical", "High", "Medium", "Low"],
      maintenance_task_status: ["Open", "InProgress", "Completed", "Cancelled"],
      subscription_plan: [
        "owner_operator",
        "small_fleet",
        "growth_fleet",
        "enterprise",
      ],
      subscription_status: [
        "trial",
        "active",
        "past_due",
        "suspended",
        "cancelled",
      ],
    },
  },
} as const
