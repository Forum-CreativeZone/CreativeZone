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
  await expect(page.getByText('Categoria → Subcategoria → Fórum → Tópicos.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Sugerir categoria/ })).toBeVisible()
})


test('community chat renders on the forum home', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Chat da Comunidade', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Entre na CreativeZone para participar do chat/i })).toBeVisible()
})


test('keeps login and signup forms vertically structured', async ({ page }) => {
  await page.goto('/entrar')
  await expect(page.getByRole('heading', { name: 'Entrar na CreativeZone' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar com Google' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar com GitHub' })).toBeVisible()

  const email = page.getByLabel('E-mail')
  const password = page.getByLabel('Senha')
  const emailBox = await email.boundingBox()
  const passwordBox = await password.boundingBox()

  expect(emailBox?.width || 0).toBeGreaterThan(300)
  expect(passwordBox?.width || 0).toBeGreaterThan(300)
  expect((passwordBox?.y || 0)).toBeGreaterThan((emailBox?.y || 0))

  await page.goto('/cadastro')
  await expect(page.getByRole('heading', { name: 'Criar conta na CreativeZone' })).toBeVisible()
  const usernameBox = await page.getByLabel('Nome de usuário').boundingBox()
  const displayNameBox = await page.getByLabel('Nome exibido').boundingBox()
  expect((displayNameBox?.y || 0)).toBeGreaterThan((usernameBox?.y || 0))
})


test('adapts the forum information rail between desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 })
  await page.goto('/')
  await expect(page.locator('.forum-home-sidebar')).toBeVisible()
  await expect(page.locator('.forum-mobile-dashboard')).toBeHidden()
  await expect(page.locator('.forum-home-sidebar').getByText('Estatísticas do fórum', { exact: true })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.forum-home-sidebar')).toBeHidden()
  await expect(page.locator('.forum-mobile-dashboard')).toBeVisible()

  const mobileDashboard = page.locator('.forum-mobile-dashboard')
  await expect(mobileDashboard.getByText('Comunidade agora', { exact: true })).toBeVisible()
  await expect(
    mobileDashboard.locator('.forum-side-categories .forum-side-card-head strong')
  ).toHaveText('Categorias')
})
