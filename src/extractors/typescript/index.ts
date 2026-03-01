/**
 * TypeScript/JavaScript symbol extractor using TS Compiler API
 */

import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { ExtractionError } from '../../cli/utils/errors.js';
import type { ConditionInfo } from '../../graph/types.js';
import { extractJsDoc } from '../jsdoc/index.js';
import type {
  CallSite,
  ExtractionResult,
  ImportInfo,
  JsDocInfo,
  ParamInfo,
  ReExportInfo,
  SymbolInfo,
} from '../types.js';

/** Extracts symbols (functions, classes, arrow functions, call expressions) from TypeScript/JavaScript files using the TS Compiler API. */
export class TypeScriptExtractor {
  /**
   * Extract all symbols from a TypeScript/JavaScript file
   */
  extractSymbols(filePath: string): ExtractionResult {
    const symbols: SymbolInfo[] = [];
    const errors: string[] = [];

    try {
      const sourceText = readFileSync(filePath, 'utf-8');
      const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

      const visit = (node: ts.Node) => {
        try {
          // Function declarations: function foo() {}
          if (ts.isFunctionDeclaration(node) && node.name) {
            symbols.push(this.extractFunction(node, sourceFile));
          }

          // Arrow functions: const foo = () => {}
          // Call expressions: const foo = task({...})
          if (ts.isVariableStatement(node) && node.declarationList.declarations.length > 0) {
            const decl = node.declarationList.declarations[0];
            if (
              decl.initializer &&
              (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
            ) {
              symbols.push(this.extractArrowFunction(decl, sourceFile));
            } else if (
              decl.initializer &&
              ts.isCallExpression(decl.initializer) &&
              ts.isIdentifier(decl.name) &&
              this.isTopLevelVariable(node, sourceFile)
            ) {
              symbols.push(this.extractCallExpression(decl, sourceFile));
            }
          }

          // Class declarations: class Foo {}
          if (ts.isClassDeclaration(node) && node.name) {
            symbols.push(this.extractClass(node, sourceFile));
          }

          // Recurse into child nodes
          ts.forEachChild(node, visit);
        } catch (error) {
          errors.push(
            `Error extracting from node at ${node.pos}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      };

      visit(sourceFile);
    } catch (error) {
      throw new ExtractionError(
        `Failed to extract symbols from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { symbols, errors };
  }

  /**
   * Extract a single symbol by name
   */
  extractSymbol(filePath: string, symbolName: string): SymbolInfo | null {
    const result = this.extractSymbols(filePath);
    return result.symbols.find((s) => s.name === symbolName) || null;
  }

  /**
   * Extract call sites from a symbol's body.
   * Detects conditional context (if/else, switch, ternary, &&/||) and
   * records a chain of ancestor conditions on each call site.
   */
  extractCallSites(filePath: string, symbolName: string): CallSite[] {
    const sourceText = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

    // Find the symbol's AST node
    const bodyNode = this.findSymbolBody(sourceFile, symbolName);
    if (!bodyNode) return [];

    const allCallSites: CallSite[] = [];
    // Track total branch count per branchGroup for accurate dedup
    const branchCounts = new Map<string, number>();
    const countBranch = (group: string) =>
      branchCounts.set(group, (branchCounts.get(group) || 0) + 1);

    const getLine = (node: ts.Node): number =>
      sourceFile.getLineAndCharacterOfPosition(node.pos).line;

    const walkIfElseChain = (
      node: ts.IfStatement,
      conditions: ConditionInfo[],
      branchGroup: string,
      isFirst = true,
    ) => {
      const condText = node.expression.getText(sourceFile).slice(0, 60);

      // Walk the "then" branch (first in chain is "if", rest are "else if")
      const thenCondition: ConditionInfo = isFirst
        ? { condition: `if (${condText})`, branch: 'then', branchGroup }
        : { condition: `else if (${condText})`, branch: 'else-if', branchGroup };
      countBranch(branchGroup);
      walk(node.thenStatement, [...conditions, thenCondition]);

      if (!node.elseStatement) {
        // Implicit else path — no code to walk but counts as a branch for dedup
        countBranch(branchGroup);
        return;
      }

      // Detect "else if" — recurse to keep same branchGroup for flat chain
      if (ts.isIfStatement(node.elseStatement)) {
        walkIfElseChain(node.elseStatement, conditions, branchGroup, false);
      } else {
        countBranch(branchGroup);
        walk(node.elseStatement, [
          ...conditions,
          { condition: 'else', branch: 'else', branchGroup },
        ]);
      }
    };

    const walk = (node: ts.Node, conditions: ConditionInfo[]) => {
      // --- if / else if / else ---
      if (ts.isIfStatement(node)) {
        const group = `branch:${getLine(node)}`;
        walkIfElseChain(node, conditions, group);
        return;
      }

      // --- switch/case (with fall-through for empty cases) ---
      if (ts.isSwitchStatement(node)) {
        const switchExpr = node.expression.getText(sourceFile).slice(0, 40);
        const group = `branch:${getLine(node)}`;
        let pendingLabels: string[] = [];

        for (const clause of node.caseBlock.clauses) {
          const label = ts.isCaseClause(clause) ? clause.expression.getText(sourceFile) : 'default';

          if (clause.statements.length === 0) {
            pendingLabels.push(label);
            continue;
          }

          const allLabels = [...pendingLabels, label];
          pendingLabels = [];
          const caseText =
            allLabels.length > 1
              ? `case ${allLabels.join(' | ')}`
              : label === 'default'
                ? 'default'
                : `case ${label}`;

          countBranch(group);
          walk(clause, [
            ...conditions,
            {
              condition: `switch (${switchExpr}): ${caseText}`,
              branch: caseText,
              branchGroup: group,
            },
          ]);
        }
        return;
      }

      // --- ternary: cond ? a : b ---
      if (ts.isConditionalExpression(node)) {
        const condText = node.condition.getText(sourceFile).slice(0, 60);
        const group = `branch:${getLine(node)}`;
        countBranch(group);
        walk(node.whenTrue, [
          ...conditions,
          { condition: `if (${condText})`, branch: 'then', branchGroup: group },
        ]);
        countBranch(group);
        walk(node.whenFalse, [
          ...conditions,
          { condition: 'else', branch: 'else', branchGroup: group },
        ]);
        return;
      }

      // --- && / || guards: cond && foo() ---
      if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
      ) {
        const op = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? '&&' : '||';
        const condText = node.left.getText(sourceFile).slice(0, 60);
        // Left side is always evaluated
        walk(node.left, conditions);
        // Right side is conditional on left
        walk(node.right, [
          ...conditions,
          { condition: `${condText} ${op}`, branch: op, branchGroup: `branch:${getLine(node)}` },
        ]);
        return;
      }

      if (ts.isCallExpression(node)) {
        const expression = node.expression.getText(sourceFile);
        const name = this.extractCallName(node.expression, sourceFile);
        if (name) {
          allCallSites.push({
            name,
            expression,
            ...(conditions.length > 0 && { conditions: [...conditions] }),
          });
        }
      }

      ts.forEachChild(node, (child) => walk(child, conditions));
    };

    walk(bodyNode, []);
    return this.deduplicateCallSites(allCallSites, branchCounts);
  }

  /**
   * Deduplicate call sites by target name.
   * - If any occurrence is unconditional (no conditions), unconditional wins.
   * - If a target appears in ALL branches of the same branchGroup, it's unconditional.
   * - Otherwise keep the first conditional occurrence.
   */
  private deduplicateCallSites(
    callSites: CallSite[],
    branchCounts: Map<string, number>,
  ): CallSite[] {
    const grouped = new Map<string, CallSite[]>();
    for (const site of callSites) {
      const existing = grouped.get(site.name) || [];
      existing.push(site);
      grouped.set(site.name, existing);
    }

    const result: CallSite[] = [];
    for (const [, sites] of grouped) {
      // If any occurrence is unconditional, unconditional wins
      const unconditional = sites.find((s) => !s.conditions || s.conditions.length === 0);
      if (unconditional) {
        result.push({ name: unconditional.name, expression: unconditional.expression });
        continue;
      }

      // Check if occurrences cover ALL branches of the same outermost branchGroup
      // (meaning the function is called regardless of the condition)
      const byOuterGroup = new Map<string, Set<string>>();
      for (const site of sites) {
        if (site.conditions && site.conditions.length > 0) {
          const outer = site.conditions[0];
          const branches = byOuterGroup.get(outer.branchGroup) || new Set();
          branches.add(outer.branch);
          byOuterGroup.set(outer.branchGroup, branches);
        }
      }

      let isEffectivelyUnconditional = false;
      for (const [group, branches] of byOuterGroup) {
        const totalBranches = branchCounts.get(group) || 0;
        if (totalBranches > 0 && branches.size === totalBranches) {
          isEffectivelyUnconditional = true;
          break;
        }
      }

      if (isEffectivelyUnconditional) {
        result.push({ name: sites[0].name, expression: sites[0].expression });
      } else {
        // Keep first occurrence
        result.push(sites[0]);
      }
    }

    return result;
  }

  /**
   * Extract import declarations from a file
   */
  extractImports(filePath: string): ImportInfo[] {
    const sourceText = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

    const imports: ImportInfo[] = [];

    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isImportDeclaration(node)) return;

      const moduleSpecifier = node.moduleSpecifier;
      if (!ts.isStringLiteral(moduleSpecifier)) return;
      const source = moduleSpecifier.text;

      const importClause = node.importClause;
      if (!importClause) return;

      // Skip type-only imports: import type { Foo } from "..."
      if (importClause.isTypeOnly) return;

      // Default import: import Foo from "..."
      if (importClause.name) {
        const name = importClause.name.getText(sourceFile);
        imports.push({ name, originalName: name, source, isDefault: true });
      }

      // Named imports: import { Foo, Bar, original as renamed } from "..."
      if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
        for (const element of importClause.namedBindings.elements) {
          // Skip type-only elements: import { type Foo } from "..."
          if (element.isTypeOnly) continue;

          const localName = element.name.getText(sourceFile);
          // propertyName is the original export name (only present when renamed)
          const originalName = element.propertyName
            ? element.propertyName.getText(sourceFile)
            : localName;
          imports.push({ name: localName, originalName, source, isDefault: false });
        }
      }
    });

    return imports;
  }

  /**
   * Extract re-export declarations from a file.
   * Handles: export { Foo } from "./bar", export { Foo as Bar } from "./bar"
   */
  extractReExports(filePath: string): ReExportInfo[] {
    const sourceText = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

    const reExports: ReExportInfo[] = [];

    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isExportDeclaration(node)) return;
      if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return;

      const source = node.moduleSpecifier.text;

      // Skip type-only exports: export type { Foo } from "..."
      if (node.isTypeOnly) return;

      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        // Named re-exports: export { Foo, Bar as Baz } from "./bar"
        for (const element of node.exportClause.elements) {
          if (element.isTypeOnly) continue;

          const localName = element.name.getText(sourceFile);
          // propertyName is the original name in the source module (only present when renamed)
          const originalName = element.propertyName
            ? element.propertyName.getText(sourceFile)
            : localName;
          reExports.push({ localName, originalName, source });
        }
      }
      // Note: export * from "./bar" has no exportClause — we skip star re-exports for now
    });

    return reExports;
  }

  /**
   * Find the body AST node for a named symbol
   */
  private findSymbolBody(sourceFile: ts.SourceFile, symbolName: string): ts.Node | null {
    let body: ts.Node | null = null;

    const visit = (node: ts.Node) => {
      if (body) return;

      if (ts.isFunctionDeclaration(node) && node.name?.getText(sourceFile) === symbolName) {
        body = node.body || null;
        return;
      }

      if (ts.isVariableStatement(node)) {
        const decl = node.declarationList.declarations[0];
        if (decl?.name.getText(sourceFile) === symbolName && decl.initializer) {
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            body = decl.initializer.body || null;
            return;
          }
          // Handle call expressions: const foo = task({...}), const bar = inngest.createFunction({...})
          if (ts.isCallExpression(decl.initializer)) {
            body = decl.initializer;
            return;
          }
        }
      }

      if (ts.isClassDeclaration(node) && node.name?.getText(sourceFile) === symbolName) {
        body = node;
        return;
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return body;
  }

  /**
   * Extract the callable name from a call expression
   * e.g. `foo()` → "foo", `this.bar()` → "bar", `obj.method()` → "method"
   */
  private extractCallName(expr: ts.Expression, sourceFile: ts.SourceFile): string | null {
    if (ts.isIdentifier(expr)) {
      return expr.getText(sourceFile);
    }
    if (ts.isPropertyAccessExpression(expr)) {
      return expr.name.getText(sourceFile);
    }
    return null;
  }

  /**
   * Detect whether a symbol is a React component.
   * Requires: JSX-capable file (.tsx/.jsx), PascalCase name, and JSX in body.
   */
  private isReactComponent(name: string, body: ts.Node | null, filePath: string): boolean {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.jsx')) return false;
    if (!/^[A-Z]/.test(name)) return false;
    if (!body) return false;
    return this.containsJsx(body);
  }

  /** Recursively check whether an AST node contains any JSX elements or fragments. */
  private containsJsx(node: ts.Node): boolean {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      return true;
    }
    let found = false;
    ts.forEachChild(node, (child) => {
      if (!found) found = this.containsJsx(child);
    });
    return found;
  }

  /**
   * Extract structured parameter info from a function's parameter declarations.
   * Gets types from the AST, descriptions from JSDoc @param tags.
   */
  private extractStructuredParams(
    parameters: ts.NodeArray<ts.ParameterDeclaration>,
    jsDoc: JsDocInfo | undefined,
    sourceFile: ts.SourceFile,
  ): ParamInfo[] {
    const paramDescriptions = new Map<string, string>();
    if (jsDoc) {
      for (const p of jsDoc.params) {
        paramDescriptions.set(p.name, p.description);
      }
    }

    const result: ParamInfo[] = [];

    for (const param of parameters) {
      // Expand destructured object parameters into individual entries
      if (ts.isObjectBindingPattern(param.name)) {
        const propertyTypes = new Map<string, { type: string; isOptional: boolean }>();
        if (param.type && ts.isTypeLiteralNode(param.type)) {
          for (const member of param.type.members) {
            if (ts.isPropertySignature(member) && member.name) {
              const propName = member.name.getText(sourceFile);
              const propType = member.type ? member.type.getText(sourceFile) : 'unknown';
              propertyTypes.set(propName, { type: propType, isOptional: !!member.questionToken });
            }
          }
        }

        for (const element of param.name.elements) {
          if (ts.isOmittedExpression(element)) continue;
          const elemName = element.name.getText(sourceFile);
          const lookupName = element.propertyName
            ? element.propertyName.getText(sourceFile)
            : elemName;
          const propInfo = propertyTypes.get(lookupName);
          const type = propInfo?.type ?? 'unknown';
          const isOptional = propInfo?.isOptional ?? false;
          const defaultValue = element.initializer
            ? element.initializer.getText(sourceFile)
            : undefined;
          const description = paramDescriptions.get(elemName) ?? paramDescriptions.get(lookupName);

          result.push({
            name: elemName,
            type,
            isOptional: isOptional || !!element.initializer,
            isRest: false,
            ...(defaultValue !== undefined && { defaultValue }),
            ...(description !== undefined && { description }),
          });
        }
        continue;
      }

      const name = param.name.getText(sourceFile);
      const type = param.type ? param.type.getText(sourceFile) : 'unknown';
      const isOptional = !!param.questionToken || !!param.initializer;
      const isRest = !!param.dotDotDotToken;
      const defaultValue = param.initializer ? param.initializer.getText(sourceFile) : undefined;
      const description = paramDescriptions.get(name);

      result.push({
        name,
        type,
        isOptional,
        isRest,
        ...(defaultValue !== undefined && { defaultValue }),
        ...(description !== undefined && { description }),
      });
    }

    return result;
  }

  /**
   * Extract the return type annotation from a function-like node.
   */
  private extractReturnType(
    node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
    sourceFile: ts.SourceFile,
  ): string | undefined {
    return node.type ? node.type.getText(sourceFile) : undefined;
  }

  /**
   * Check if a node has the export keyword modifier.
   */
  private isNodeExported(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }

  /**
   * Extract function declaration
   */
  private extractFunction(node: ts.FunctionDeclaration, sourceFile: ts.SourceFile): SymbolInfo {
    const name = node.name?.getText(sourceFile);
    const fullText = node.getText(sourceFile);

    // Extract parameters (everything between parentheses)
    const params = node.parameters.map((p) => p.getText(sourceFile)).join(', ');

    // Extract body (everything inside the braces)
    const body = node.body ? node.body.getText(sourceFile) : '';

    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.pos);
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.end);

    const jsDoc = extractJsDoc(node, sourceFile);
    const structuredParams = this.extractStructuredParams(node.parameters, jsDoc, sourceFile);
    const returnType = this.extractReturnType(node, sourceFile);
    const isExported = this.isNodeExported(node);

    return {
      name,
      kind: this.isReactComponent(name, node.body ?? null, sourceFile.fileName)
        ? 'component'
        : 'function',
      filePath: sourceFile.fileName,
      params,
      body,
      fullText,
      startLine: startLine + 1,
      endLine: endLine + 1,
      structuredParams,
      returnType,
      isExported,
      jsDoc,
    };
  }

  /**
   * Extract arrow function or function expression
   */
  private extractArrowFunction(
    decl: ts.VariableDeclaration,
    sourceFile: ts.SourceFile,
  ): SymbolInfo {
    const name = decl.name.getText(sourceFile);
    // biome-ignore lint/style/noNonNullAssertion: caller guarantees initializer exists for arrow functions
    const func = decl.initializer!;

    let params = '';
    let body = '';
    let structuredParams: ParamInfo[] | undefined;
    let returnType: string | undefined;

    // JSDoc is on the VariableDeclaration — extractJsDoc handles parent traversal
    const jsDoc = extractJsDoc(decl, sourceFile);

    if (ts.isArrowFunction(func)) {
      params = func.parameters.map((p) => p.getText(sourceFile)).join(', ');
      body = ts.isBlock(func.body)
        ? func.body.getText(sourceFile)
        : `{ return ${func.body.getText(sourceFile)} }`;
      structuredParams = this.extractStructuredParams(func.parameters, jsDoc, sourceFile);
      returnType = this.extractReturnType(func, sourceFile);
    } else if (ts.isFunctionExpression(func)) {
      params = func.parameters.map((p) => p.getText(sourceFile)).join(', ');
      body = func.body ? func.body.getText(sourceFile) : '';
      structuredParams = this.extractStructuredParams(func.parameters, jsDoc, sourceFile);
      returnType = this.extractReturnType(func, sourceFile);
    }

    const fullText = decl.getText(sourceFile);
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(decl.pos);
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(decl.end);

    // Export is on the VariableStatement (grandparent)
    const isExported = this.isNodeExported(decl.parent.parent);

    const funcBody = ts.isArrowFunction(func) ? func.body : (func as ts.FunctionExpression).body;
    return {
      name,
      kind: this.isReactComponent(name, funcBody ?? null, sourceFile.fileName)
        ? 'component'
        : 'const',
      filePath: sourceFile.fileName,
      params,
      body,
      fullText,
      startLine: startLine + 1,
      endLine: endLine + 1,
      structuredParams,
      returnType,
      isExported,
      jsDoc,
    };
  }

  /**
   * Check if a variable statement is at the top level of the file (not nested inside functions/classes)
   */
  private isTopLevelVariable(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    return node.parent === sourceFile;
  }

  /**
   * Extract call expression assignment: const foo = someFunc({...})
   * Captures the full text so AI can analyze task definitions, etc.
   */
  private extractCallExpression(
    decl: ts.VariableDeclaration,
    sourceFile: ts.SourceFile,
  ): SymbolInfo {
    const name = decl.name.getText(sourceFile);
    const call = decl.initializer as ts.CallExpression;

    const fullText = decl.getText(sourceFile);
    const body = call.getText(sourceFile);
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(decl.pos);
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(decl.end);

    const jsDoc = extractJsDoc(decl, sourceFile);
    const isExported = this.isNodeExported(decl.parent.parent);

    return {
      name,
      kind: 'const',
      filePath: sourceFile.fileName,
      params: '',
      body,
      fullText,
      startLine: startLine + 1,
      endLine: endLine + 1,
      isExported,
      jsDoc,
    };
  }

  /**
   * Extract class declaration
   */
  private extractClass(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): SymbolInfo {
    const name = node.name?.getText(sourceFile);
    const fullText = node.getText(sourceFile);

    // For classes, we treat the whole class as the "body"
    // Individual methods can be extracted separately if needed
    const body = fullText;

    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.pos);
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.end);

    const jsDoc = extractJsDoc(node, sourceFile);
    const isExported = this.isNodeExported(node);

    return {
      name,
      kind: 'class',
      filePath: sourceFile.fileName,
      params: '',
      body,
      fullText,
      startLine: startLine + 1,
      endLine: endLine + 1,
      isExported,
      jsDoc,
    };
  }
}
