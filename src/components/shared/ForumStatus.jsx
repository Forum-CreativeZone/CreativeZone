export default function ForumStatus({ loading, error }) {
  if (loading) return <span>Sincronizando fórum...</span>
  if (error) return <span>Erro ao carregar fórum.</span>
  return null
}
