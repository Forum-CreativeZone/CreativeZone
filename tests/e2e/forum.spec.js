import { expect, test } from '@playwright/test'

test('renders the CreativeZone shell and community page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/CreativeZone/)
  await expect(page.getByRole('button', { name: 'CreativeZone', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'CreativeZone', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'CreativeZone', exact: true })).toBeVisible()
  await expect(page.getByText('Um espaço para conversar, aprender e construir juntos.')).toBeVisible()
})

test('exposes password recovery from login', async ({ page }) => {
  await page.goto('/entrar')
  await expect(page.getByRole('button', { name: 'Esqueci minha senha' })).toBeVisible()
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click()
  await expect(page.getByRole('heading', { name: 'Recuperar acesso' })).toBeVisible()
})

test('projects module is routable', async ({ page }) => {
  await page.goto('/projetos')
  await expect(page.getByRole('heading', { name: 'Projetos Creative Lab' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Creatiive-Lab/ })).toBeVisible()
})


test('category directory uses category terminology and suggestion shortcut', async ({ page }) => {
  await page.goto('/categorias')
  await expect(page.getByRole('heading', { name: 'Categorias da CreativeZone', exact: true })).toBeVisible()
  await expect(page.getByText('Organize as conversas sem engessar a comunidade.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Sugerir categoria/ })).toBeVisible()
})
