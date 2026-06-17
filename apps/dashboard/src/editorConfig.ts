import type { BeforeMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";

/* Accent hex values — keep in sync with @theme in index.css
   Monaco's defineTheme API doesn't support CSS variables,
   so these must be updated manually if the palette changes.
   Current palette: Deep Wine (#9f1239) */
const ACCENT_500 = "b44060";
const ACCENT_400 = "d4768e";
const ACCENT_300 = "e8a0b0";
const ACCENT_600 = "9f1239";

export const handleEditorWillMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("truss-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: ACCENT_300, fontStyle: "bold" },
      { token: "string", foreground: "86efac" },
      { token: "number", foreground: "fbbf24" },
      { token: "comment", foreground: "475569", fontStyle: "italic" },
      { token: "type", foreground: "7dd3fc" },
      { token: "identifier", foreground: "e2e8f0" },
      { token: "operator", foreground: "94a3b8" },
      { token: "predefined", foreground: "c4b5fd" },
    ],
    colors: {
      "editor.background": "#0c1222",
      "editor.foreground": "#e2e8f0",
      "editor.lineHighlightBackground": `#${ACCENT_500}08`,
      "editor.lineHighlightBorder": `#${ACCENT_500}20`,
      "editor.selectionBackground": `#${ACCENT_500}30`,
      "editor.inactiveSelectionBackground": `#${ACCENT_500}15`,
      "editorLineNumber.foreground": "#334155",
      "editorLineNumber.activeForeground": "#64748b",
      "editorCursor.foreground": `#${ACCENT_400}`,
      "editorBracketMatch.background": `#${ACCENT_500}15`,
      "editorBracketMatch.border": `#${ACCENT_500}40`,
      "editorIndentGuide.background": "#1e293b",
      "editorIndentGuide.activeBackground": "#334155",
      "editorGutter.background": "#0c1222",
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#94a3b820",
      "scrollbarSlider.hoverBackground": "#94a3b840",
      "scrollbarSlider.activeBackground": "#94a3b860",
      "editorOverviewRuler.border": "#00000000",
      "editorWidget.background": "#0f172a",
      "editorWidget.border": "#1e293b",
      "editorSuggestWidget.background": "#0f172a",
      "editorSuggestWidget.border": "#1e293b",
      "editorSuggestWidget.selectedBackground": `#${ACCENT_500}20`,
    },
  });
  monaco.editor.defineTheme("truss-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: ACCENT_600, fontStyle: "bold" },
      { token: "string", foreground: "059669" },
      { token: "number", foreground: "b45309" },
      { token: "comment", foreground: "94a3b8", fontStyle: "italic" },
      { token: "type", foreground: "0369a1" },
      { token: "identifier", foreground: "1e293b" },
      { token: "operator", foreground: "475569" },
      { token: "predefined", foreground: "7c3aed" },
    ],
    colors: {
      "editor.background": "#f8fafc",
      "editor.foreground": "#1e293b",
      "editor.lineHighlightBackground": `#${ACCENT_600}10`,
      "editor.lineHighlightBorder": `#${ACCENT_600}18`,
      "editor.selectionBackground": `#${ACCENT_600}28`,
      "editor.inactiveSelectionBackground": `#${ACCENT_600}12`,
      "editorLineNumber.foreground": "#94a3b8",
      "editorLineNumber.activeForeground": "#475569",
      "editorCursor.foreground": `#${ACCENT_600}`,
      "editorBracketMatch.background": `#${ACCENT_600}18`,
      "editorBracketMatch.border": `#${ACCENT_600}40`,
      "editorIndentGuide.background": "#e2e8f0",
      "editorIndentGuide.activeBackground": "#cbd5e1",
      "editorGutter.background": "#f8fafc",
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#94a3b825",
      "scrollbarSlider.hoverBackground": "#94a3b840",
      "scrollbarSlider.activeBackground": "#94a3b860",
      "editorOverviewRuler.border": "#00000000",
      "editorWidget.background": "#ffffff",
      "editorWidget.border": "#e2e8f0",
      "editorSuggestWidget.background": "#ffffff",
      "editorSuggestWidget.border": "#e2e8f0",
      "editorSuggestWidget.selectedBackground": `#${ACCENT_600}18`,
    },
  });
};

export const trussEditorOptions = {
  minimap: { enabled: false },
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
  fontLigatures: true,
  lineNumbers: "on" as const,
  wordWrap: "on" as const,
  padding: { top: 16, bottom: 16 },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: "smooth" as const,
  cursorSmoothCaretAnimation: "on" as const,
  renderLineHighlight: "all" as const,
  lineHeight: 22,
  letterSpacing: 0.3,
  roundedSelection: true,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  scrollbar: { vertical: "auto" as const, horizontal: "auto" as const, verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
  guides: { indentation: true, bracketPairs: true },
};

// ─── SQL Autocomplete ───

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
  "CREATE", "ALTER", "DROP", "TABLE", "INDEX", "VIEW", "SCHEMA", "DATABASE",
  "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS", "ON", "USING",
  "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN", "LIKE", "ILIKE", "IS", "NULL",
  "AS", "ORDER", "BY", "ASC", "DESC", "LIMIT", "OFFSET", "GROUP", "HAVING",
  "DISTINCT", "UNION", "ALL", "INTERSECT", "EXCEPT", "WITH", "RECURSIVE",
  "CASE", "WHEN", "THEN", "ELSE", "END", "CAST", "COALESCE", "NULLIF",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "ROW_NUMBER", "RANK", "DENSE_RANK",
  "OVER", "PARTITION", "WINDOW", "RETURNING", "EXPLAIN", "ANALYZE",
  "BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT", "TRANSACTION",
  "GRANT", "REVOKE", "TRIGGER", "FUNCTION", "PROCEDURE", "RETURNS",
  "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE", "CHECK", "DEFAULT",
  "CONSTRAINT", "CASCADE", "RESTRICT", "IF", "REPLACE", "TEMPORARY", "TEMP",
  "SERIAL", "BIGSERIAL", "TEXT", "VARCHAR", "INTEGER", "BIGINT", "BOOLEAN",
  "TIMESTAMP", "TIMESTAMPTZ", "DATE", "TIME", "INTERVAL", "JSONB", "JSON",
  "UUID", "NUMERIC", "DECIMAL", "FLOAT", "DOUBLE", "PRECISION", "REAL",
  "ARRAY", "BYTEA", "INET", "CIDR", "MACADDR",
  "TRUE", "FALSE", "NOW", "CURRENT_TIMESTAMP", "CURRENT_DATE", "CURRENT_USER",
];

const SQL_FUNCTIONS = [
  "count", "sum", "avg", "min", "max", "abs", "ceil", "floor", "round", "random",
  "length", "lower", "upper", "trim", "ltrim", "rtrim", "substring", "replace",
  "concat", "string_agg", "array_agg", "json_agg", "jsonb_agg",
  "json_build_object", "jsonb_build_object", "json_extract_path_text",
  "to_char", "to_date", "to_timestamp", "to_number", "extract", "date_trunc",
  "now", "current_timestamp", "age", "date_part",
  "coalesce", "nullif", "greatest", "least",
  "row_number", "rank", "dense_rank", "lag", "lead", "first_value", "last_value",
  "generate_series", "unnest", "array_length", "array_to_string",
  "pg_size_pretty", "pg_total_relation_size", "pg_relation_size",
  "encode", "decode", "md5", "gen_random_uuid",
  "ts_rank", "ts_headline", "to_tsvector", "to_tsquery", "plainto_tsquery",
];

let _completionDisposable: { dispose: () => void } | null = null;
let _slashCommandDisposable: { dispose: () => void } | null = null;

const SQL_SLASH_COMMANDS = [
  { label: "/select", insertText: "SELECT\n  *\nFROM ${1:table_name}\nWHERE ${2:condition}\nLIMIT 100;", detail: "SELECT query template" },
  { label: "/join", insertText: "SELECT\n  a.*, b.*\nFROM ${1:table_a} a\nJOIN ${2:table_b} b ON a.${3:id} = b.${4:a_id}\nLIMIT 100;", detail: "JOIN query template" },
  { label: "/insert", insertText: "INSERT INTO ${1:table_name} (${2:columns})\nVALUES (${3:values})\nRETURNING *;", detail: "INSERT template" },
  { label: "/update", insertText: "UPDATE ${1:table_name}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition}\nRETURNING *;", detail: "UPDATE template" },
  { label: "/delete", insertText: "DELETE FROM ${1:table_name}\nWHERE ${2:condition}\nRETURNING *;", detail: "DELETE template" },
  { label: "/index", insertText: "CREATE INDEX ${1:idx_name}\nON ${2:table_name} (${3:column})\nWHERE ${4:condition};", detail: "CREATE INDEX template" },
  { label: "/create", insertText: "CREATE TABLE ${1:table_name} (\n  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  ${2:column} ${3:type} NOT NULL,\n  created_at timestamptz NOT NULL DEFAULT now()\n);", detail: "CREATE TABLE template" },
  { label: "/alter", insertText: "ALTER TABLE ${1:table_name}\nADD COLUMN ${2:column} ${3:type};", detail: "ALTER TABLE template" },
  { label: "/count", insertText: "SELECT count(*) AS total\nFROM ${1:table_name}\nWHERE ${2:condition};", detail: "COUNT query" },
  { label: "/group", insertText: "SELECT\n  ${1:column},\n  count(*) AS count\nFROM ${2:table_name}\nGROUP BY ${1:column}\nORDER BY count DESC\nLIMIT 20;", detail: "GROUP BY template" },
  { label: "/explain", insertText: "EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)\n${1:SELECT * FROM table_name};", detail: "EXPLAIN ANALYZE" },
  { label: "/vacuum", insertText: "VACUUM (VERBOSE, ANALYZE) ${1:table_name};", detail: "VACUUM ANALYZE" },
];

function registerSlashCommands(monaco: typeof Monaco) {
  if (_slashCommandDisposable) _slashCommandDisposable.dispose();

  _slashCommandDisposable = monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: ["/"],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn - 1, // include the /
        endColumn: word.endColumn,
      };

      return {
        suggestions: SQL_SLASH_COMMANDS.map(cmd => ({
          label: cmd.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: cmd.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: cmd.detail,
          range,
          sortText: "0_" + cmd.label,
        })),
      };
    },
  });
}

export function registerSqlCompletion(
  monaco: typeof Monaco,
  tables: Array<{ schema: string; table: string }>,
) {
  // Register slash commands (idempotent — disposes previous)
  registerSlashCommands(monaco);

  // Dispose previous registration to avoid duplicates
  if (_completionDisposable) _completionDisposable.dispose();

  _completionDisposable = monaco.languages.registerCompletionItemProvider("sql", {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: Monaco.languages.CompletionItem[] = [];

      // SQL keywords
      for (const kw of SQL_KEYWORDS) {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
          sortText: "2_" + kw,
        });
      }

      // SQL functions
      for (const fn of SQL_FUNCTIONS) {
        suggestions.push({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: fn + "($0)",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "function",
          range,
          sortText: "3_" + fn,
        });
      }

      // Unique schemas
      const schemas = [...new Set(tables.map(t => t.schema))];
      for (const s of schemas) {
        suggestions.push({
          label: s,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: s,
          detail: "schema",
          range,
          sortText: "0_" + s,
        });
      }

      // Tables (with schema prefix for non-public)
      for (const t of tables) {
        suggestions.push({
          label: t.table,
          kind: monaco.languages.CompletionItemKind.Struct,
          insertText: t.table,
          detail: t.schema === "public" ? "table" : `${t.schema}.table`,
          range,
          sortText: "1_" + t.table,
        });
        // Also offer schema-qualified version
        if (t.schema !== "public") {
          suggestions.push({
            label: `${t.schema}.${t.table}`,
            kind: monaco.languages.CompletionItemKind.Struct,
            insertText: `${t.schema}.${t.table}`,
            detail: "table",
            range,
            sortText: "1_" + t.schema + "." + t.table,
          });
        }
      }

      return { suggestions };
    },
  });
}
