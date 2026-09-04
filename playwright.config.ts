import { defineConfig, devices } from '@playwright/test';

/**
 * Configuration Playwright pour tests e2e de Caractère ERP
 *
 * Tests critiques pour assurer la fiabilité de l'ERP en production
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Timeout par test
  timeout: 30 * 1000,

  // Expect timeout
  expect: {
    timeout: 5000,
  },

  // Workers parallèles
  workers: process.env.CI ? 1 : 4,

  // Configuration reporter
  reporter: [
    ['html', { outputFolder: 'tests/results' }],
    ['list'],
    ['junit', { outputFile: 'tests/results/junit.xml' }],
  ],

  // Configuration globale
  use: {
    // URL de base
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Screenshot & video
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  // Serveur : réutilisé s'il tourne déjà. En CI le workflow lance lui-même
  // `npm run start` (build de production) avant les tests — avec
  // reuseExistingServer à false, Playwright essayait d'en démarrer un second
  // et échouait « port 3000 already used » avant d'exécuter le moindre test
  // (30 exécutions rouges sur 30).
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },

  // Projets (navigateurs)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Optionnel: ajouter Firefox et Safari pour plus de couverture
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
  ],
});
