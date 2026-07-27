import type { Span } from './diagnostics.js';

export type BinaryOperator =
  '||' | '&&' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | '+' | '-' | '*' | '/' | '%';

export type UnaryOperator = '!' | '-';

/** Raízes de caminho. Não há outra: nada de `globalThis`, `process` ou equivalente. */
export type PathRoot = 'state' | 'in' | 'run';

export type PathStep =
  | { readonly kind: 'field'; readonly name: string; readonly span: Span }
  | { readonly kind: 'index'; readonly index: number; readonly span: Span };

export interface LiteralNode {
  readonly kind: 'literal';
  readonly value: string | number | boolean | null;
  readonly span: Span;
}

export interface PathNode {
  readonly kind: 'path';
  readonly root: PathRoot;
  readonly steps: readonly PathStep[];
  readonly span: Span;
}

export interface CallNode {
  readonly kind: 'call';
  readonly name: string;
  readonly args: readonly ExprNode[];
  readonly span: Span;
  /** Span só do nome, para o diagnóstico apontar a função e não a chamada inteira. */
  readonly nameSpan: Span;
}

export interface UnaryNode {
  readonly kind: 'unary';
  readonly operator: UnaryOperator;
  readonly operand: ExprNode;
  readonly span: Span;
}

export interface BinaryNode {
  readonly kind: 'binary';
  readonly operator: BinaryOperator;
  readonly left: ExprNode;
  readonly right: ExprNode;
  readonly span: Span;
  /** Span só do operador, para o erro de tipo apontar o `<` e não a expressão toda. */
  readonly operatorSpan: Span;
}

/**
 * Parênteses explícitos do autor.
 *
 * Guardar isso na AST é o que faz `print(parse(s))` reparsear para a **mesma** AST sem
 * precisar reinventar precedência na impressão — e sem encher a saída de parênteses que
 * ninguém escreveu. Round-trip é critério de aceite da Fase 1.
 */
export interface GroupNode {
  readonly kind: 'group';
  readonly inner: ExprNode;
  readonly span: Span;
}

export type ExprNode = LiteralNode | PathNode | CallNode | UnaryNode | BinaryNode | GroupNode;

/** Percorre a AST em pré-ordem. Iterativo: expressão profunda não estoura a pilha. */
export function walk(root: ExprNode, visit: (node: ExprNode) => void): void {
  const stack: ExprNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    visit(node);

    switch (node.kind) {
      case 'binary':
        stack.push(node.right, node.left);
        break;
      case 'unary':
        stack.push(node.operand);
        break;
      case 'group':
        stack.push(node.inner);
        break;
      case 'call':
        for (let i = node.args.length - 1; i >= 0; i--) {
          const arg = node.args[i];
          if (arg !== undefined) stack.push(arg);
        }
        break;
      case 'literal':
      case 'path':
        break;
    }
  }
}

/** Texto do caminho como o autor escreveu, para mensagens: `state.documents[0].title`. */
export function formatPath(node: PathNode): string {
  let out: string = node.root;
  for (const step of node.steps) {
    out += step.kind === 'field' ? `.${step.name}` : `[${String(step.index)}]`;
  }
  return out;
}
