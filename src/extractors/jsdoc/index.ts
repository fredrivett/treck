/**
 * JSDoc extraction helper using the TypeScript Compiler API.
 * Extracts descriptions, @param, @returns, @example, @deprecated, @throws, @see.
 */

import ts from 'typescript';
import type { JsDocInfo, JsDocParamTag } from '../types.js';

/**
 * Normalize a JSDoc comment value to a plain string.
 * The TS API returns either a string or a NodeArray<JSDocComment> depending on
 * whether the comment contains inline tags like {@link ...}.
 */
function commentToString(
  comment: string | ts.NodeArray<ts.JSDocComment> | undefined,
): string | undefined {
  if (comment === undefined) return undefined;
  if (typeof comment === 'string') return comment;
  // NodeArray<JSDocComment> — concatenate the text of each part
  return comment.map((part) => part.getText()).join('');
}

/**
 * Extract JSDoc information from a TypeScript AST node.
 * Returns undefined if no JSDoc comment is found.
 *
 * For VariableDeclarations (arrow functions, const assignments), the JSDoc is
 * attached to the parent VariableStatement, so we walk up the tree.
 */
export function extractJsDoc(node: ts.Node, _sourceFile: ts.SourceFile): JsDocInfo | undefined {
  // For variable declarations, JSDoc is on the VariableStatement (grandparent)
  const jsDocNode = ts.isVariableDeclaration(node) ? (node.parent?.parent ?? node) : node;

  // Get all JSDoc nodes attached to this AST node
  const jsDocs = (jsDocNode as { jsDoc?: ts.JSDoc[] }).jsDoc;
  if (!jsDocs || jsDocs.length === 0) return undefined;

  // Use the last JSDoc comment (closest to the declaration)
  const jsDoc = jsDocs[jsDocs.length - 1];

  const description = commentToString(jsDoc.comment) || undefined;
  const params = extractParamDescriptions(jsDoc);
  const returns = extractReturns(jsDoc);
  const examples = extractExamples(jsDoc);
  const deprecated = extractDeprecated(jsDoc);
  const throws = extractAllTagTexts(jsDoc, 'throws');
  const see = extractSeeTags(jsDoc);

  // Only return if there's something extracted
  if (
    !description &&
    params.length === 0 &&
    !returns &&
    examples.length === 0 &&
    deprecated === undefined &&
    throws.length === 0 &&
    see.length === 0
  ) {
    return undefined;
  }

  return {
    ...(description !== undefined && { description }),
    params,
    ...(returns !== undefined && { returns }),
    examples,
    ...(deprecated !== undefined && { deprecated }),
    throws,
    see,
  };
}

/**
 * Extract @param tag descriptions. Ignores JSDoc type annotations — only
 * extracts the name and description text.
 */
function extractParamDescriptions(jsDoc: ts.JSDoc): JsDocParamTag[] {
  const tags = jsDoc.tags;
  if (!tags) return [];

  const result: JsDocParamTag[] = [];

  for (const tag of tags) {
    if (!ts.isJSDocParameterTag(tag)) continue;

    const name = tag.name.getText();
    let description = commentToString(tag.comment) ?? '';
    // Strip leading "- " that's commonly used in "@param name - description" format
    description = description.replace(/^-\s+/, '');

    result.push({ name, description });
  }

  return result;
}

/**
 * Extract @returns or @return description text.
 */
function extractReturns(jsDoc: ts.JSDoc): string | undefined {
  const tags = jsDoc.tags;
  if (!tags) return undefined;

  for (const tag of tags) {
    if (ts.isJSDocReturnTag(tag)) {
      return commentToString(tag.comment) || undefined;
    }
  }

  return undefined;
}

/**
 * Extract all @example tag content as code strings.
 */
function extractExamples(jsDoc: ts.JSDoc): string[] {
  const tags = jsDoc.tags;
  if (!tags) return [];

  const results: string[] = [];

  for (const tag of tags) {
    if (tag.tagName.text !== 'example') continue;
    const text = commentToString(tag.comment);
    if (text?.trim()) {
      results.push(text.trim());
    }
  }

  return results;
}

/**
 * Extract @deprecated tag. Returns true if present with no reason,
 * or the reason string if provided.
 */
function extractDeprecated(jsDoc: ts.JSDoc): string | true | undefined {
  const tags = jsDoc.tags;
  if (!tags) return undefined;

  for (const tag of tags) {
    if (ts.isJSDocDeprecatedTag(tag)) {
      const text = commentToString(tag.comment);
      if (text?.trim()) {
        return text.trim();
      }
      return true;
    }
  }

  return undefined;
}

/**
 * Extract @see tags. The TS compiler parses these as JSDocSeeTag with a
 * special `name` property containing the reference, so we need dedicated handling.
 */
function extractSeeTags(jsDoc: ts.JSDoc): string[] {
  const tags = jsDoc.tags;
  if (!tags) return [];

  const results: string[] = [];

  for (const tag of tags) {
    if (tag.tagName.text !== 'see') continue;

    // Build the full text from the tag's name reference + comment
    const parts: string[] = [];

    // JSDocSeeTag has a .name property with the entity reference
    const seeTag = tag as ts.JSDocSeeTag;
    if (seeTag.name) {
      parts.push(seeTag.name.getText());
    }

    const commentText = commentToString(tag.comment);
    if (commentText?.trim()) {
      parts.push(commentText.trim());
    }

    const fullText = parts.join('').trim();
    if (fullText) {
      results.push(fullText);
    }
  }

  return results;
}

/**
 * Extract all occurrences of a given tag name (e.g. 'throws').
 */
function extractAllTagTexts(jsDoc: ts.JSDoc, tagName: string): string[] {
  const tags = jsDoc.tags;
  if (!tags) return [];

  const results: string[] = [];

  for (const tag of tags) {
    if (tag.tagName.text !== tagName) continue;
    const text = commentToString(tag.comment);
    if (text?.trim()) {
      results.push(text.trim());
    }
  }

  return results;
}
