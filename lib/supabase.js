import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Restaurants ────────────────────────────────────────────

export async function getRestaurants() {
  const { data, error } = await supabase
    .from('restaurants')
    .select(`*, dishes(*)`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addRestaurant({ name, emoji, color, lat, lng, address }) {
  const { data, error } = await supabase
    .from('restaurants')
    .insert([{ name, emoji, color, lat, lng, address }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Dishes ─────────────────────────────────────────────────

export async function addDish({ restaurant_id, name, rating, notes, photo_url, added_by }) {
  const { data, error } = await supabase
    .from('dishes')
    .insert([{ restaurant_id, name, rating, notes, photo_url, added_by }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDish(id) {
  const { error } = await supabase.from('dishes').delete().eq('id', id);
  if (error) throw error;
}

// ── Photo upload ───────────────────────────────────────────

export async function uploadPhoto(file) {
  const ext = file.name.split('.').pop();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from('dish-photos')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('dish-photos').getPublicUrl(path);
  return data.publicUrl;
}
