import type { PoolClient } from "pg";

export interface DbUser {
  id: string;
  email: string;
  hashed_password: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface DbMembership {
  id: string;
  org_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

export type DbClient = PoolClient;
