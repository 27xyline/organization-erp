import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'
import reactHooks from 'eslint-plugin-react-hooks'

const featureBoundaryPatterns = [
  {
    group: ['@/app/**'],
    message: 'Feature-модуль не должен зависеть от App Router.',
  },
  {
    group: [
      '@/features/*/application/**',
      '@/features/*/domain/**',
      '@/features/*/infrastructure/**',
      '@/features/*/ui/**',
    ],
    message: 'Внутренние слои другого feature недоступны; используйте contracts или композицию в app.',
  },
]

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/features/**', '@/app/**'],
          message: 'Общая инфраструктура не должна зависеть от feature-модулей или App Router.',
        }],
      }],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['src/features/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: featureBoundaryPatterns,
      }],
    },
  },
  {
    files: ['src/features/*/domain/**/*.{ts,tsx}'],
    ignores: ['src/features/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [...featureBoundaryPatterns, {
          group: ['../application/**', '../infrastructure/**', '../ui/**', '@/lib/prisma', 'next/**', 'react'],
          message: 'Domain-слой должен оставаться чистым и независимым.',
        }],
      }],
    },
  },
  {
    files: ['src/features/*/application/**/*.{ts,tsx}'],
    ignores: ['src/features/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [...featureBoundaryPatterns, {
          group: ['../ui/**'], message: 'Application-слой не зависит от UI.',
        }],
      }],
    },
  },
  {
    files: ['src/features/*/infrastructure/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [...featureBoundaryPatterns, {
          group: ['../application/**', '../ui/**'],
          message: 'Infrastructure не зависит от application или UI.',
        }],
      }],
    },
  },
  {
    files: ['src/features/*/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [...featureBoundaryPatterns, {
          group: ['../application/**', '../infrastructure/**', '@/lib/prisma'],
          message: 'Feature UI использует contracts и HTTP, но не server-only application/infrastructure.',
        }],
      }],
    },
  },
  globalIgnores([
    'dist/**',
    '.next/**',
    '.next-dev/**',
    '.next-dev-turbo/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),
])
