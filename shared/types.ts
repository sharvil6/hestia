export interface Ingredient {
  qty: number;
  unit: string;
  item: string;
  note?: string;
}

export interface Instruction {
  step_number: number;
  text: string;
  image_path?: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Annotation {
  id: string;
  recipe_id: string;
  user_id?: string;
  step_index?: number;
  content: string;
  image_path?: string;
  created_at: string;
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  cover_image?: string;
  original_yield?: number;
  prep_time?: number;
  cook_time?: number;
  source_url?: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  tags: Tag[];
  annotations: Annotation[];
}

export interface RecipeCreate {
  title: string;
  description?: string;
  cover_image?: string;
  original_yield?: number;
  prep_time?: number;
  cook_time?: number;
  source_url?: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  tags: string[];
}

// ----- Auth types -------------------------------------------------------------

export interface User {
  id: string;
  display_name: string;
  avatar_id: string | null;
  is_admin: boolean;
}

export interface SessionInfo {
  id_prefix: string;
  auth_method: 'word_key' | 'passkey';
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  user_agent: string | null;
  device_label: string | null;
  current: boolean;
}

export interface PasskeyInfo {
  id: string;
  nickname: string;
  created_at: string;
  last_used_at: string | null;
}

export interface AdminUserInfo extends User {
  has_active_key: boolean;
  passkey_count: number;
  session_count: number;
  created_at: string;
}

export interface InviteCreated {
  code: string;
  enroll_url: string;
  expires_at: string;
  intended_display_name: string;
}

export interface EnrollResult {
  user: User;
  key_words: string[];
  key_qr_payload: string;
}
