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

export const FAMILY_MEMBERS: Record<string, { name: string; color: string }> = {
  '1': { name: 'Mom', color: 'red' },
  '2': { name: 'Dad', color: 'blue' },
  '3': { name: 'Kids', color: 'green' },
};
