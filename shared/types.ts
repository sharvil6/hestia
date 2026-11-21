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
  author_name?: string;
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
  // Non-null when the recipe has a live public share link.
  share_token?: string | null;
  // ISO timestamps; used by the home page for recency-ordered groups.
  created_at: string;
  updated_at?: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  tags: Tag[];
  annotations: Annotation[];
}

// A comment as exposed on the public share page (no user_id / privacy fields).
export interface PublicAnnotation {
  id: string;
  step_index?: number;
  content: string;
  image_path?: string;
  author_name?: string;
  created_at: string;
}

// Read-only recipe payload returned by the unauthenticated public share endpoint.
export interface PublicRecipe {
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
  annotations: PublicAnnotation[];
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

// ----- Recipe drafts ----------------------------------------------------------

// A draft's saved form state. Mirrors the add-recipe form rather than the Recipe
// shape: fields may be blank or half-typed, which is the whole point of a draft.
export interface RecipeDraftPayload {
  title: string;
  description: string;
  yieldAmount: number | '';
  prepTime: number | '';
  cookTime: number | '';
  tags: string[];
  ingredients: Ingredient[];
  // Step photos are uploaded before the draft is saved, so only the path travels.
  instructions: { text: string; image_path?: string | null }[];
  sourceUrl: string;
}

// List row — no payload, so the drafts list stays cheap to fetch.
export interface RecipeDraftSummary {
  id: string;
  title: string | null;
  ingredient_count: number;
  instruction_count: number;
  created_at: string;
  updated_at: string;
}

export interface RecipeDraft extends RecipeDraftSummary {
  payload: Partial<RecipeDraftPayload>;
}

// ----- Meal plans -------------------------------------------------------------

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

// Minimal user projection returned to any authenticated user (member pickers,
// plan member lists).
export interface UserPublic {
  id: string;
  display_name: string;
  avatar_id: string | null;
}

export interface RecipeSummary {
  id: string;
  title: string;
  cover_image?: string | null;
}

export interface MealPlanEntry {
  id: string;
  day: number; // 0 = Monday … 6 = Sunday
  slot: MealSlot;
  position: number;
  // Batch multiplier (2 = doubled). Grocery quantities scale with it.
  scale: number;
  recipe: RecipeSummary;
}

export interface GroceryItem {
  id: string;
  item: string;
  qty: number | null;
  unit: string;
  checked: boolean;
  is_manual: boolean;
  position: number;
}

export interface MealPlanSummary {
  id: string;
  name: string | null;
  week_start: string; // ISO date, always a Monday
  created_by: string;
  owner: UserPublic;
  members: UserPublic[];
  created_at: string;
  updated_at?: string;
}

export interface MealPlanDetail extends MealPlanSummary {
  entries: MealPlanEntry[];
  grocery_items: GroceryItem[];
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

export interface ApiTokenInfo {
  id: string;
  name: string;
  scope: 'read';
  id_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiTokenCreated extends ApiTokenInfo {
  /** Raw bearer token. Only returned once, at creation. */
  token: string;
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

export interface AuthEvent {
  id: string;
  event_type: 'login' | 'logout' | 'login_failed' | 'enroll' | 'key_rotate';
  user_id: string | null;
  display_name: string | null;
  auth_method: 'word_key' | 'passkey' | 'demo' | null;
  ip: string | null;
  country: string | null;
  user_agent: string | null;
  detail: string | null;
  created_at: string;
}

export interface UserActivity {
  user_id: string;
  display_name: string;
  is_admin: boolean;
  active_sessions: number;
  last_seen_at: string | null;
  last_login_at: string | null;
  last_ip: string | null;
  last_country: string | null;
  login_count: number;
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
