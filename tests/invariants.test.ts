/**
 * Guarda dos invariantes do AGENTS.md que dá para verificar por leitura do repositório.
 *
 * Existe porque regra de lint se desliga com um comentário e política escrita em markdown
 * não se desliga nem se verifica — ela só envelhece. Estes testes falham a suíte.
 *
 * O alvo são os invariantes estruturais: 3 (nenhuma avaliação dinâmica), 9 (o núcleo não
 * importa React/Next/SDK de provider) e a coerência do próprio bootstrap.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Pacotes sob o regime estrito dos invariantes 9 e 10. */
const CORE_PACKAGES = ['packages/expr', 'packages/graph-core', 'packages/compiler'] as const;

const SPECS = ['ir-v1.md', 'agx-expr.md', 'trace-v1.md', 'lowerings.md'] as const;

interface PackageManifest {
  readonly name?: string;
  readonly license?: string;
  readonly private?: boolean;
  readonly type?: string;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T;
}

function readText(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function exists(path: string): boolean {
  try {
    statSync(join(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

/** Todo diretório que tem package.json sob packages/, em caminho relativo com '/'. */
function findPackageDirs(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      const rel = relative(ROOT, full).split(sep).join('/');
      if (exists(`${rel}/package.json`)) found.push(rel);
      walk(full);
    }
  };
  walk(join(ROOT, 'packages'));
  return found.sort();
}

const packageDirs = findPackageDirs();

/** Todo arquivo .ts sob src/ dos pacotes, em caminho relativo com '/'. */
function findSourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        found.push(relative(ROOT, full).split(sep).join('/'));
      }
    }
  };
  for (const pkg of packageDirs) {
    if (exists(`${pkg}/src`)) walk(join(ROOT, pkg, 'src'));
  }
  return found.sort();
}

const sourceFiles = findSourceFiles();

describe('invariante 3 — nenhuma avaliação dinâmica', () => {
  // Cada padrão é uma rota conhecida para executar string como código. `constructor` de
  // literal entra porque ''.constructor.constructor é o caminho clássico até Function
  // sem escrever o nome dele.
  const FORBIDDEN: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
    ['eval(', /\beval\s*\(/],
    ['new Function(', /\bnew\s+Function\s*\(/],
    ['Function( como avaliador', /[^.\w]Function\s*\(\s*['"`]/],
    ['import de vm', /from\s+['"](?:node:)?vm['"]/],
    ['require de vm', /require\s*\(\s*['"](?:node:)?vm['"]\s*\)/],
    ['constructor de literal', /['"`]\s*\.\s*constructor/],
  ];

  it('encontra arquivos de origem para varrer', () => {
    // Sem esta asserção, um bug no walker faria a varredura passar sobre lista vazia —
    // o teste ficaria verde exatamente por não ter olhado nada.
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  for (const [label, pattern] of FORBIDDEN) {
    it(`nenhum \`${label}\` em packages/**/src`, () => {
      const offenders = sourceFiles.filter((file) => pattern.test(readText(file)));
      expect(offenders).toEqual([]);
    });
  }

  it('a barreira de lint está declarada no eslint.config.mjs', () => {
    const config = readText('eslint.config.mjs');
    for (const rule of ['no-eval', 'no-implied-eval', 'no-new-func', 'no-restricted-syntax']) {
      expect(config).toContain(rule);
    }
  });
});

describe('invariante 9 — o núcleo não depende de UI nem de SDK de provider', () => {
  const FORBIDDEN_DEPS = [
    'react',
    'react-dom',
    'next',
    'openai',
    '@anthropic-ai/sdk',
    'cohere-ai',
    'ollama',
  ];

  for (const pkg of CORE_PACKAGES) {
    it(`${pkg} não declara dependência proibida`, () => {
      const manifest = readJson<PackageManifest>(`${pkg}/package.json`);
      const declared = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
      });
      expect(declared.filter((d) => FORBIDDEN_DEPS.includes(d))).toEqual([]);
    });
  }

  it('nenhum import de React ou Next nos fontes do núcleo', () => {
    const pattern = /from\s+['"](?:react|react-dom|next)(?:\/[^'"]*)?['"]/;
    const offenders = sourceFiles
      .filter((file) => CORE_PACKAGES.some((pkg) => file.startsWith(`${pkg}/`)))
      .filter((file) => pattern.test(readText(file)));
    expect(offenders).toEqual([]);
  });
});

describe('coerência do bootstrap', () => {
  it('todo pacote está coberto pelos globs do workspace', () => {
    const globs = readText('pnpm-workspace.yaml');
    for (const pkg of packageDirs) {
      const parent = pkg.split('/').slice(0, -1).join('/');
      expect(globs, `${pkg} não está coberto`).toContain(`${parent}/*`);
    }
  });

  it('todo pacote declara os scripts do portão de qualidade', () => {
    for (const pkg of packageDirs) {
      const manifest = readJson<PackageManifest>(`${pkg}/package.json`);
      expect(manifest.scripts?.['build'], `${pkg} sem build`).toBeDefined();
      expect(manifest.scripts?.['typecheck'], `${pkg} sem typecheck`).toBeDefined();
    }
  });

  it('todo pacote é Apache-2.0 e ESM', () => {
    for (const pkg of packageDirs) {
      const manifest = readJson<PackageManifest>(`${pkg}/package.json`);
      expect(manifest.license, `${pkg}`).toBe('Apache-2.0');
      expect(manifest.type, `${pkg}`).toBe('module');
    }
  });

  it('todo pacote tem tsconfig de typecheck e de build, ambos herdando a base', () => {
    for (const pkg of packageDirs) {
      expect(exists(`${pkg}/tsconfig.json`), `${pkg}/tsconfig.json`).toBe(true);
      expect(exists(`${pkg}/tsconfig.build.json`), `${pkg}/tsconfig.build.json`).toBe(true);
      const tsconfig = readJson<{ extends?: string }>(`${pkg}/tsconfig.json`);
      expect(tsconfig.extends).toMatch(/tsconfig\.base\.json$/);
    }
  });

  it('o tsconfig base mantém strict e as checagens além do strict', () => {
    const base = readJson<{ compilerOptions: Record<string, unknown> }>('tsconfig.base.json');
    for (const flag of [
      'strict',
      'noUncheckedIndexedAccess',
      'exactOptionalPropertyTypes',
      'noImplicitOverride',
      'noImplicitReturns',
      'noFallthroughCasesInSwitch',
    ]) {
      expect(base.compilerOptions[flag], flag).toBe(true);
    }
  });

  it('nenhum pacote depende de pacote que o workspace não tem', () => {
    const known = new Set(
      packageDirs.map((pkg) => readJson<PackageManifest>(`${pkg}/package.json`).name),
    );
    for (const pkg of packageDirs) {
      const manifest = readJson<PackageManifest>(`${pkg}/package.json`);
      for (const [dep, range] of Object.entries(manifest.dependencies ?? {})) {
        if (!range.startsWith('workspace:')) continue;
        expect(known, `${pkg} depende de ${dep}, que não existe`).toContain(dep);
      }
    }
  });
});

describe('todo diagnóstico emitido tem página (critério de aceite 08)', () => {
  // O critério diz "100% dos códigos emitidos têm página". Escrito só no plano, ele
  // envelhece: alguém acrescenta um código na Fase 2 e ninguém percebe. Aqui o código
  // emitido é extraído do fonte, e a suíte falha se a página não existir.
  const emitted = (): string[] => {
    const codes = new Set<string>();
    for (const file of findSourceFiles()) {
      if (file.endsWith('.test.ts')) continue;
      for (const match of readText(file).matchAll(/'(AGX-[ERW]\d{3})'/gu)) {
        const code = match[1];
        if (code !== undefined) codes.add(code);
      }
    }
    return [...codes].sort();
  };

  it('encontra códigos emitidos para verificar', () => {
    // Sem isto, um regex que parasse de casar faria a checagem passar sobre lista vazia.
    expect(emitted().length).toBeGreaterThan(0);
  });

  it('cada código emitido tem página em docs/diagnostics', () => {
    const missing = emitted().filter((code) => !exists(`docs/diagnostics/${code}.md`));
    expect(missing).toEqual([]);
  });

  it('cada página traz as quatro seções obrigatórias', () => {
    for (const code of emitted()) {
      const page = readText(`docs/diagnostics/${code}.md`);
      for (const section of [
        '## O que aconteceu',
        '## Por que isso é um problema',
        '## Como corrigir',
        '## Quando o erro é o esperado',
      ]) {
        expect(page, `${code} sem "${section}"`).toContain(section);
      }
      // Uma página de três linhas satisfaria "existe" sem ajudar ninguém — que é
      // exatamente o defeito que a exigência de página existe para corrigir.
      expect(page.length, code).toBeGreaterThan(800);
    }
  });
});

describe('a camada normativa existe e está referenciada', () => {
  for (const spec of SPECS) {
    it(`specs/${spec} existe e se declara normativo`, () => {
      const text = readText(`specs/${spec}`);
      expect(text).toContain('NORMATIVO');
      // Uma spec de duas linhas satisfaria "existe" sem decidir nada, que é
      // exatamente o defeito que esta camada existe para corrigir.
      expect(text.length).toBeGreaterThan(2000);
    });
  }

  it('o AGENTS.md declara os 12 invariantes', () => {
    const agents = readText('AGENTS.md');
    const section = agents.slice(agents.indexOf('## Invariantes'), agents.indexOf('## Como'));
    const numbered = section.match(/^\d{1,2}\. \*\*/gmu) ?? [];
    expect(numbered).toHaveLength(12);
  });

  it('os documentos de governança exigidos pelo ADR-0001 existem', () => {
    for (const file of ['LICENSE', 'NOTICE', 'CONTRIBUTING.md', 'SECURITY.md']) {
      expect(exists(file), file).toBe(true);
    }
    expect(readText('LICENSE')).toContain('Apache License');
    expect(readText('CONTRIBUTING.md')).toContain('Signed-off-by');
  });
});
