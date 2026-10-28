/**
 * Universal Polyglot Taint Tracker Engine (v2.0)
 * Intra-procedural and Inter-procedural Taint Propagation across PHP, Python, Go, and JS/TS.
 */

export interface TaintSource {
  variable: string;
  sourceType: string;
  line: number;
  snippet: string;
}

export interface TaintSinkHit {
  sinkType: 'SQLI' | 'XSS' | 'CMD_INJECTION' | 'PATH_TRAVERSAL';
  sinkFunction: string;
  taintedVariable: string;
  line: number;
  snippet: string;
  sanitized: boolean;
  sanitizer?: string;
  isParameterized?: boolean;
}

export interface TaintTrace {
  file: string;
  source: TaintSource;
  sinkHit: TaintSinkHit;
  propagationPath: Array<{ variable: string; line: number; snippet: string }>;
}

export class TaintTracker {
  // --------------------------------------------------------------------------
  // TAINT SOURCES
  // --------------------------------------------------------------------------
  private static readonly SOURCE_PATTERNS = {
    php: [
      /\$_(GET|POST|REQUEST|COOKIE|SERVER)\s*\[\s*['"]?([a-zA-Z0-9_-]+)['"]?\s*\]/g,
      /\$request->(?:input|get|query|post)\s*\(\s*['"]?([a-zA-Z0-9_-]+)?['"]?\s*\)/g,
      /\$request->([a-zA-Z0-9_]+)/g,
      /\brequest\s*\(\s*['"]?([a-zA-Z0-9_-]+)?['"]?\s*\)/g
    ],
    python: [
      /\brequest\.(?:args|form|values|json)\.get\s*\(\s*['"]([a-zA-Z0-9_-]+)['"]/g,
      /\brequest\.(?:args|form|values|json|GET|POST)\s*\[\s*['"]([a-zA-Z0-9_-]+)['"]\s*\]/g,
      /\brequest\.data\b/g,
      /\brequest\.body\b/g
    ],
    go: [
      /\b(?:c|ctx)\.(?:Query|PostForm|Param)\s*\(\s*"([^"]+)"\s*\)/g,
      /\b(?:c|ctx)\.(?:Bind|ShouldBind|BindJSON)\s*\(\s*&?([a-zA-Z0-9_]+)\s*\)/g,
      /\br\.(?:URL\.Query\(\)\.Get|FormValue|PostFormValue)\s*\(\s*"([^"]+)"\s*\)/g
    ],
    ts: [
      /\b(?:req|request)\.(?:query|body|params|headers)\.([a-zA-Z0-9_]+)/g,
      /\b(?:req|request)\.(?:query|body|params)\s*\[\s*['"]([a-zA-Z0-9_-]+)['"]\s*\]/g,
      /\bsearchParams\.get\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    ]
  };

  // --------------------------------------------------------------------------
  // SANITIZERS
  // --------------------------------------------------------------------------
  private static readonly SANITIZER_PATTERNS = {
    php: [
      /\b(?:intval|floatval|htmlspecialchars|htmlentities|addslashes|filter_var|strip_tags)\s*\(/,
      /\((?:int|integer|float|double|bool|boolean)\)/
    ],
    python: [
      /\b(?:int|float|html\.escape|escape|bleach\.clean)\s*\(/
    ],
    go: [
      /\b(?:strconv\.(?:Atoi|ParseInt|ParseFloat)|html\.EscapeString|url\.QueryEscape)\s*\(/
    ],
    ts: [
      /\b(?:parseInt|parseFloat|Number|validator\.escape|DOMPurify\.sanitize|encodeURIComponent)\s*\(/
    ]
  };

  // --------------------------------------------------------------------------
  // SINKS
  // --------------------------------------------------------------------------
  private static readonly SINK_PATTERNS = {
    SQLI: [
      // PHP
      /(?:mysqli_query\s*\(|\$(?:pdo|db|conn)->(?:query|exec)\s*\(|DB::(?:raw|select|statement|unprepared)\s*\()/i,
      // Python
      /(?:cursor|conn|session|db|engine)\.(?:execute|executemany|raw)\s*\(/i,
      // Go
      /(?:db|tx|conn)\.(?:Query|QueryRow|Exec|Raw)\s*\(/i,
      // TS / JS
      /(?:db|pool|client)\.(?:query|raw|\$queryRawUnsafe)\s*\(/i
    ],
    XSS: [
      // PHP unescaped echo or Blade {!! $var !!}
      /\b(?:echo|print)\s+[^;]+/i,
      /\{!!\s*[\s\S]*?\s*!!\}/,
      // Python
      /\brender_template_string\s*\(|mark_safe\s*\(|\{\{\s*[^}]+\|\s*safe\s*\}\}/i,
      // Go
      /(?:c\.HTML|tmpl\.Execute|tmpl\.ExecuteTemplate|w\.Write)\s*\(/i,
      // TS / JS
      /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/i,
      /\.innerHTML\s*=/i
    ],
    CMD_INJECTION: [
      // PHP
      /\b(?:exec|system|shell_exec|passthru|proc_open|popen)\s*\(/i,
      // Python
      /\b(?:os\.system|subprocess\.(?:Popen|run|call|check_output))\s*\(/i,
      // Go
      /\bexec\.Command\s*\(/i,
      // TS / JS
      /\b(?:child_process\.)?(?:exec|execSync|spawn|spawnSync)\s*\(/i
    ],
    PATH_TRAVERSAL: [
      // PHP
      /\b(?:file_get_contents|file_put_contents|readfile|fopen|unlink|include|require)\s*\(/i,
      // Python
      /\b(?:open|os\.remove|os\.unlink|shutil\.(?:copy|move))\s*\(/i,
      // Go
      /\bos\.(?:ReadFile|WriteFile|Open|OpenFile|Create|Remove)\s*\(/i,
      // TS / JS
      /\bfs\.(?:readFileSync|writeFileSync|readFile|writeFile|unlinkSync)\s*\(/i
    ]
  };

  /**
   * Detect language from file path extension
   */
  public static detectLanguage(filePath: string): 'php' | 'python' | 'go' | 'ts' {
    const ext = filePath.toLowerCase();
    if (ext.endsWith('.php') || ext.endsWith('.phtml') || ext.endsWith('.blade.php')) return 'php';
    if (ext.endsWith('.py')) return 'python';
    if (ext.endsWith('.go')) return 'go';
    return 'ts';
  }

  /**
   * Intra-procedural taint analysis for a source code string
   */
  public analyzeCode(filePath: string, code: string): TaintTrace[] {
    const lang = TaintTracker.detectLanguage(filePath);
    const lines = code.split('\n');
    const traces: TaintTrace[] = [];

    // Map: variableName -> { source, sanitized, line, history }
    const taintMap = new Map<string, {
      source: TaintSource;
      sanitized: boolean;
      sanitizerName?: string;
      line: number;
      history: Array<{ variable: string; line: number; snippet: string }>;
    }>();

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i];
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) {
        continue;
      }

      // 1. Check for Direct Variable Source Assignments:
      // Examples:
      // PHP: $id = $_GET['id'];
      // Python: user_id = request.args.get('id')
      // Go: id := c.Query("id")
      // TS: const id = req.query.id;
      this.detectTaintSources(lang, line, lineNum, taintMap);

      // 2. Track Variable-to-Variable Propagation and Sanitization
      this.propagateTaint(lang, line, lineNum, taintMap);

      // 3. Inspect Sinks
      const sinkHits = this.checkSinks(lang, line, lineNum, taintMap);
      for (const hit of sinkHits) {
        const taintInfo = taintMap.get(hit.taintedVariable);
        traces.push({
          file: filePath,
          source: taintInfo ? taintInfo.source : {
            variable: hit.taintedVariable,
            sourceType: 'INLINE_INPUT',
            line: lineNum,
            snippet: line
          },
          sinkHit: hit,
          propagationPath: taintInfo ? [...taintInfo.history] : [{ variable: hit.taintedVariable, line: lineNum, snippet: line }]
        });
      }
    }

    return traces;
  }

  private detectTaintSources(
    lang: 'php' | 'python' | 'go' | 'ts',
    line: string,
    lineNum: number,
    taintMap: Map<string, any>
  ): void {
    const sourcePatterns = TaintTracker.SOURCE_PATTERNS[lang];
    for (const pat of sourcePatterns) {
      pat.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pat.exec(line)) !== null) {
        // Extract LHS variable assigned from this source
        const lhsVar = this.extractLhsVariable(lang, line);
        if (lhsVar) {
          const isSanitized = this.isLineSanitized(lang, line);
          taintMap.set(lhsVar, {
            source: {
              variable: lhsVar,
              sourceType: match[0],
              line: lineNum,
              snippet: line
            },
            sanitized: isSanitized.sanitized,
            sanitizerName: isSanitized.sanitizer,
            line: lineNum,
            history: [{ variable: lhsVar, line: lineNum, snippet: line }]
          });
        }
      }
    }
  }

  private propagateTaint(
    lang: 'php' | 'python' | 'go' | 'ts',
    line: string,
    lineNum: number,
    taintMap: Map<string, any>
  ): void {
    const lhs = this.extractLhsVariable(lang, line);
    if (!lhs) return;

    // Check if any existing tainted variable is on the RHS
    for (const [tVar, info] of taintMap.entries()) {
      if (tVar === lhs) continue;
      // Lookaround check for variable on RHS (handles $ in PHP as well as letters)
      const escaped = tVar.replace(/[$]/g, '\\$');
      const rhsRegex = new RegExp(`(?<![a-zA-Z0-9_])${escaped}(?![a-zA-Z0-9_])`);
      if (rhsRegex.test(line)) {
        const isSanitized = this.isLineSanitized(lang, line);
        taintMap.set(lhs, {
          source: info.source,
          sanitized: info.sanitized || isSanitized.sanitized,
          sanitizerName: isSanitized.sanitizer || info.sanitizerName,
          line: lineNum,
          history: [...info.history, { variable: lhs, line: lineNum, snippet: line }]
        });
      }
    }
  }

  private checkSinks(
    lang: 'php' | 'python' | 'go' | 'ts',
    line: string,
    lineNum: number,
    taintMap: Map<string, any>
  ): TaintSinkHit[] {
    const hits: TaintSinkHit[] = [];

    // Helper to evaluate a specific sink category
    const evaluateSinkCategory = (
      sinkType: 'SQLI' | 'XSS' | 'CMD_INJECTION' | 'PATH_TRAVERSAL',
      patterns: RegExp[]
    ) => {
      for (const pat of patterns) {
        if (pat.test(line)) {
          // Check if any tainted variable is passed into this sink line
          for (const [tVar, info] of taintMap.entries()) {
            const escaped = tVar.replace(/[$]/g, '\\$');
            const varRegex = new RegExp(`(?<![a-zA-Z0-9_])${escaped}(?![a-zA-Z0-9_])`);
            if (varRegex.test(line)) {
              let isParam = false;
              if (sinkType === 'SQLI') {
                isParam = this.isParameterizedQuery(line);
              }

              hits.push({
                sinkType,
                sinkFunction: pat.toString(),
                taintedVariable: tVar,
                line: lineNum,
                snippet: line,
                sanitized: info.sanitized || this.isLineSanitized(lang, line).sanitized,
                sanitizer: info.sanitizerName,
                isParameterized: isParam
              });
            }
          }

          // Also check for inline direct sources inside sink (e.g. echo $_GET['x'];)
          const sourcePatterns = TaintTracker.SOURCE_PATTERNS[lang];
          for (const srcPat of sourcePatterns) {
            srcPat.lastIndex = 0;
            const srcMatch = srcPat.exec(line);
            if (srcMatch) {
              const isSanitized = this.isLineSanitized(lang, line);
              hits.push({
                sinkType,
                sinkFunction: pat.toString(),
                taintedVariable: srcMatch[0],
                line: lineNum,
                snippet: line,
                sanitized: isSanitized.sanitized,
                sanitizer: isSanitized.sanitizer,
                isParameterized: sinkType === 'SQLI' ? this.isParameterizedQuery(line) : false
              });
            }
          }
        }
      }
    };

    evaluateSinkCategory('SQLI', TaintTracker.SINK_PATTERNS.SQLI);
    evaluateSinkCategory('XSS', TaintTracker.SINK_PATTERNS.XSS);
    evaluateSinkCategory('CMD_INJECTION', TaintTracker.SINK_PATTERNS.CMD_INJECTION);
    evaluateSinkCategory('PATH_TRAVERSAL', TaintTracker.SINK_PATTERNS.PATH_TRAVERSAL);

    return hits;
  }

  private extractLhsVariable(lang: 'php' | 'python' | 'go' | 'ts', line: string): string | null {
    if (lang === 'php') {
      const m = line.match(/^(\$[a-zA-Z0-9_]+)\s*=/);
      return m ? m[1] : null;
    }
    if (lang === 'python') {
      const m = line.match(/^([a-zA-Z0-9_]+)\s*=/);
      return m ? m[1] : null;
    }
    if (lang === 'go') {
      const m = line.match(/^([a-zA-Z0-9_]+)\s*(?::=|=)/);
      return m ? m[1] : null;
    }
    // JS/TS
    const m = line.match(/^(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=/);
    return m ? m[1] : null;
  }

  private isLineSanitized(lang: 'php' | 'python' | 'go' | 'ts', line: string): { sanitized: boolean; sanitizer?: string } {
    const sanitizers = TaintTracker.SANITIZER_PATTERNS[lang];
    for (const s of sanitizers) {
      const match = line.match(s);
      if (match) {
        return { sanitized: true, sanitizer: match[0] };
      }
    }
    return { sanitized: false };
  }

  /**
   * Negative filter for SQL Injection:
   * Returns true if query uses parameterized syntax (?, :name, $1, or separated tuple args)
   */
  public isParameterizedQuery(line: string): boolean {
    // 1. Check for prepared statement placeholders: ?, :named_param, $1
    const hasPlaceholders = /\?|:[a-zA-Z0-9_]+|\$[1-9]\b/.test(line);
    // 2. Check if arguments array/tuple is passed as second argument:
    // e.g. cursor.execute("SELECT ... %s", (val,)) or DB::select("...", [val]) or db.Query("...", val)
    const hasParamArg = /,\s*(?:\[|\(|\$params|args\b|params\b)/i.test(line);

    // If query string concatenates directly (+) or ($var) without placeholders:
    const hasDirectConcat = /['"`]\s*\+\s*|\.\s*\$|\$[a-zA-Z0-9_]+['"`]|f['"][^'"]*\{/.test(line);

    if (hasPlaceholders && hasParamArg) return true;
    if (hasParamArg && !hasDirectConcat) return true;
    return false;
  }
}
