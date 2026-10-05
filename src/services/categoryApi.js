import { supabase } from './supabaseClient'
import { slugify } from '../utils/forumUtils'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function createCategory({ name, description = '' }) {
  const client = requireSupabase()
  const cleanName = String(name || '').trim()
  const cleanDescription = String(description || '').trim()
  if (cleanName.length < 3) throw new Error('Use pelo menos 3 caracteres no nome da categoria.')

  const { data, error } = await client
    .from('categories')
    .insert({
      name: cleanName,
      slug: slugify(cleanName),
      description: cleanDescription,
    })
    .select('id,name,slug,description,icon')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe uma categoria com este nome.')
    }
    throw error
  }
  return data
}

export async function updateCategory(categoryId, { name, description = '' }) {
  const client = requireSupabase()
  const cleanName = String(name || '').trim()
  if (cleanName.length < 3) throw new Error('Use pelo menos 3 caracteres no nome da categoria.')

  const { data, error } = await client
    .from('categories')
    .update({
      name: cleanName,
      slug: slugify(cleanName),
      description: String(description || '').trim(),
    })
    .eq('id', categoryId)
    .select('id,name,slug,description,icon')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Já existe uma categoria com este nome.')
    }
    throw error
  }
  return data
}

export async function deleteCategory(categoryId) {
  const client = requireSupabase()
  const { error } = await client
    .from('categories')
    .delete()
    .eq('id', categoryId)

  if (error) {
    if (error.code === '23503') {
      throw new Error('Esta categoria possui tópicos. Mova ou exclua os tópicos antes de remover a categoria.')
    }
    throw error
  }
}

export async function submitCategorySuggestion(userId, { name, description = '' }) {
  const client = requireSupabase()
  if (!userId) throw new Error('Entre na sua conta para sugerir uma categoria.')

  const cleanName = String(name || '').trim()
  if (cleanName.length < 3) throw new Error('Informe um nome com pelo menos 3 caracteres.')

  const { data, error } = await client
    .from('category_suggestions')
    .insert({
      user_id: userId,
      suggested_name: cleanName,
      description: String(description || '').trim(),
    })
    .select('id,suggested_name,description,status,created_at')
    .single()

  if (error) throw error
  return data
}

export async function getCategorySuggestions(status = 'pending') {
  const client = requireSupabase()
  let query = client
    .from('category_suggestions')
    .select('*, author:profiles!category_suggestions_user_id_fkey(id,username,display_name,avatar_url)')
    .order('created_at', { ascending: false })

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query.limit(100)
  if (error) throw error
  return data ?? []
}

export async function reviewCategorySuggestion({
  suggestionId,
  reviewerId,
  status,
  adminNote = '',
}) {
  const client = requireSupabase()
  if (!['reviewing', 'approved', 'declined'].includes(status)) {
    throw new Error('Status de sugestão inválido.')
  }

  const { data, error } = await client
    .from('category_suggestions')
    .update({
      status,
      reviewed_by: reviewerId,
      reviewed_at: ['approved', 'declined'].includes(status) ? new Date().toISOString() : null,
      admin_note: String(adminNote || '').trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', suggestionId)
    .select('*')
    .single()

  if (error) throw error
  return data
}
