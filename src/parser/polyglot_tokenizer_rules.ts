/**
 * Universal Polyglot Tokenizer Rules & Pattern Set (v2.0)
 * Covers: PHP Native, Laravel, Python (FastAPI/Django/Flask), Go (Gin/Fiber/Echo), JS/TS
 */

export interface PolyglotPatternSet {
  language: 'php' | 'python' | 'go' | 'ts';
  entries: RegExp[];
  controllersAndLogic: RegExp[];
  dependencyInjection: RegExp[];
  modelsAndRelations: RegExp[];
  dbSinksAndSchemas: RegExp[];
  viewsAndResponses: RegExp[];
}

export const POLYGLOT_PATTERNS: Record<'php' | 'python' | 'go' | 'ts', PolyglotPatternSet> = {
  php: {
    language: 'php',
    entries: [
      // 1. Laravel Tuple Route: Route::get('/users', [UserController::class, 'index'])
      /Route::(get|post|put|patch|delete|options|any|match)\s*\(\s*(?:\[[^\]]+\]\s*,\s*)?['"]([^'"]+)['"]\s*,\s*\[\s*([A-Za-z0-9_\\]+)::class\s*,\s*['"]([A-Za-z0-9_]+)['"]\s*\]/gm,
      // 2. Laravel String Route: Route::post('/login', 'AuthController@login')
      /Route::(get|post|put|patch|delete|any)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([A-Za-z0-9_\\]+)@([A-Za-z0-9_]+)['"]/gm,
      // 3. Laravel Invokable Controller: Route::get('/profile', ShowProfileController::class)
      /Route::(get|post|put|patch|delete|any)\s*\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_\\]+)::class\s*\)/gm,
      // 4. Laravel Resource Route: Route::resource('photos', PhotoController::class)
      /Route::(resource|apiResource)\s*\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_\\]+)::class/gm,
      // 5. Native PHP Direct Entry (file reading HTTP superglobals outside class)
      /\$_(GET|POST|REQUEST|FILES|SERVER)\s*\[\s*['"]([^'"]+)['"]\s*\]/gm,
    ],
    controllersAndLogic: [
      // Class declaration with inheritance
      /class\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_\\]+))?(?:\s+implements\s+([A-Za-z0-9_\\,\s]+))?/gm,
      // Method/Function declaration with parameters
      /(?:(public|protected|private)\s+)?(?:static\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/gm,
    ],
    dependencyInjection: [
      // Type-hinted parameters inside __construct or controller action: (OrderService $orderService, Request $request)
      /([A-Z][A-Za-z0-9_\\]*)\s+\$([a-zA-Z0-9_]+)/g,
      // Service Container resolution: app(OrderService::class) or resolve(OrderService::class)
      /\b(?:app|resolve)\s*\(\s*([A-Za-z0-9_\\]+)::class\s*\)/gm,
    ],
    modelsAndRelations: [
      // Eloquent Model Relationship methods
      /function\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*(?::\s*[A-Za-z0-9_\\]+)?\s*\{\s*return\s+\$this->(hasOne|hasMany|belongsTo|belongsToMany|morphTo|morphMany|morphToMany|hasManyThrough|hasOneThrough)\s*\(\s*([A-Za-z0-9_\\]+)::class/gms,
      // Static Eloquent Calls in Logic: User::where(...), Order::find(...), Product::with(...)
      /\b([A-Z][A-Za-z0-9_]*)::(where|find|findOrFail|first|firstOrCreate|updateOrCreate|create|insert|with|query|all|destroy)\s*\(/gm,
    ],
    dbSinksAndSchemas: [
      // Laravel Migration Schema
      /Schema::(create|table)\s*\(\s*['"]([a-zA-Z0-9_]+)['"]\s*,\s*function\s*\(\s*(?:Blueprint\s+)?\$table\s*\)\s*\{([\s\S]*?)\}\s*\)\s*;/gm,
      // Explicit Model Table Name
      /protected\s+\$table\s*=\s*['"]([a-zA-Z0-9_]+)['"]\s*;/gm,
      // Query Builder Table
      /DB::table\s*\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/gm,
      // Native PHP SQL Execution (PDO & MySQLi) along with table extraction
      /(?:mysqli_query\s*\([^,]+,|\$(?:pdo|db|conn|mysqli)->(?:query|prepare|exec)\s*\()\s*['"`]\s*(?:SELECT\s+[\s\S]*?\s+FROM|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[`"']?([a-zA-Z0-9_]+)[`"']?/gim,
    ],
    viewsAndResponses: [
      // Laravel Blade View & Inertia
      /\b(?:view|View::make|Inertia::render|inertia)\s*\(\s*['"]([a-zA-Z0-9_./-]+)['"]/gm,
      // Blade Directives inside .blade.php files
      /@(extends|include|includeIf|includeWhen|each|component)\s*\(\s*['"]([a-zA-Z0-9_.-]+)['"]/gm,
      // Native PHP Template Include
      /\b(?:include|include_once|require|require_once)\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"]+\.(?:php|phtml|html))['"]\s*\)?/gm,
    ],
  },

  python: {
    language: 'python',
    entries: [
      // FastAPI / Flask Decorator Routes (supports multi-line decorators before def/async def)
      /@([a-zA-Z0-9_]+)\.(get|post|put|delete|patch|options|head|route|api_route|websocket)\s*\(\s*['"]([^'"]+)['"](?:[^)]*)\)\s*(?:@[^\n]+\n\s*)*(?:async\s+)?def\s+([a-zA-Z0-9_]+)/gm,
      // Django urls.py path/re_path
      /\b(?:path|re_path)\s*\(\s*r?['"]([^'"]*)['"]\s*,\s*([a-zA-Z0-9_.]+)(?:\.as_view\(\))?/gm,
      // Native CLI Entry
      /if\s+__name__\s*==\s*['"]__main__['"]\s*:/gm,
    ],
    controllersAndLogic: [
      /(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*(?:->\s*([^:]+))?\s*:/gm,
      /class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?\s*:/gm,
    ],
    dependencyInjection: [
      // FastAPI Depends: service: UserService = Depends(get_user_service) or Annotated[UserService, Depends(...)]
      /([a-zA-Z0-9_]+)\s*:\s*(?:Annotated\[\s*([A-Za-z0-9_]+)\s*,\s*)?(?:[A-Za-z0-9_]+\s*=\s*)?Depends\(\s*([A-Za-z0-9_.]+)?\s*\)/gm,
    ],
    modelsAndRelations: [
      // SQLAlchemy / Django / SQLModel / Pydantic class
      /class\s+([A-Za-z0-9_]+)\s*\(\s*([^)]*(?:Base|Model|BaseModel|SQLModel)[^)]*)\s*\)\s*:/gm,
      // SQLAlchemy relationship() & ForeignKey()
      /([a-zA-Z0-9_]+)\s*(?::\s*[^=]+)?=\s*(?:relationship|mapped_column|Column)\s*\(\s*['"]?([A-Za-z0-9_]+)['"]?(?:[\s\S]*?ForeignKey\(\s*['"]([a-zA-Z0-9_.]+)['"]\s*\))?/gm,
      // Django ForeignKey / OneToOneField / ManyToManyField
      /([a-zA-Z0-9_]+)\s*=\s*models\.(ForeignKey|OneToOneField|ManyToManyField)\s*\(\s*(?:to=)?['"]?([A-Za-z0-9_.]+)['"]?/gm,
      // ORM Queries in Logic: session.query(User), select(User), User.objects.filter(...)
      /(?:\b(?:session|db)\.query\(\s*([A-Z][A-Za-z0-9_]*)\s*\)|\bselect\(\s*([A-Z][A-Za-z0-9_]*)\s*\)|\b([A-Z][A-Za-z0-9_]*)\.objects\.(?:filter|get|all|create|update|exclude|select_related|prefetch_related)\s*\()/gm,
    ],
    dbSinksAndSchemas: [
      /__tablename__\s*=\s*['"]([a-zA-Z0-9_]+)['"]/gm,
      /db_table\s*=\s*['"]([a-zA-Z0-9_]+)['"]/gm,
      /(?:cursor|conn|session|db|engine)\.(?:execute|executemany|raw)\s*\(\s*(?:text\s*\(\s*)?[fFrR]?['"`]{1,3}\s*(?:SELECT\s+[\s\S]*?\s+FROM|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[`"']?([a-zA-Z0-9_]+)[`"']?/gim,
    ],
    viewsAndResponses: [
      /\b(?:render_template|TemplateResponse)\s*\(\s*(?:request\s*,\s*)?['"]([^'"]+\.(?:html|jinja|jinja2|j2))['"]/gm,
      /\brender\s*\(\s*[a-zA-Z0-9_]+\s*,\s*['"]([^'"]+\.(?:html|txt))['"]/gm,
    ],
  },

  go: {
    language: 'go',
    entries: [
      // Gin / Echo / Fiber / Chi / Gorilla / net/http routes
      /\b([a-zA-Z0-9_]+)\.(GET|POST|PUT|DELETE|PATCH|Options|Head|Any|Get|Post|Put|Delete|Patch|HandleFunc|Handle)\s*\(\s*"([^"]+)"\s*,\s*([a-zA-Z0-9_.]+)/gm,
    ],
    controllersAndLogic: [
      // Go Function & Struct Method Receiver: func (s *UserService) GetUser(ctx context.Context)
      /func\s+(?:\(\s*([a-zA-Z0-9_]+)\s+\*?([A-Za-z0-9_]+)\s*\)\s*)?([A-Za-z0-9_]+)\s*\(([^)]*)\)/gm,
    ],
    dependencyInjection: [
      // Struct field dependencies & Constructor injection NewUserHandler(svc *UserService)
      /type\s+([A-Za-z0-9_]+)\s+struct\s*\{([\s\S]*?)\}/gm,
      /func\s+New([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\*?([A-Za-z0-9_]+)/gm,
    ],
    modelsAndRelations: [
      // Struct with GORM / DB / SQL tags
      /type\s+([A-Za-z0-9_]+)\s+struct\s*\{([\s\S]*?`(gorm|db|sql|bun):"[^"]+"`[\s\S]*?)\}/gm,
      // GORM Operations: db.Model(&User{}), db.Where(...).First(&user)
      /\b(?:db|tx)\.(?:Model|First|Find|Create|Save|Update|Delete|Preload|Joins)\s*\(\s*&?([A-Za-z0-9_]+)(?:\{\})?/gm,
    ],
    dbSinksAndSchemas: [
      // Explicit GORM TableName() override: func (User) TableName() string { return "custom_users" }
      /func\s*\(\s*\w*\s*\*?([A-Za-z0-9_]+)\s*\)\s*TableName\s*\(\s*\)\s*string\s*\{\s*return\s+"([^"]+)"\s*\}/gm,
      // Raw SQL in database/sql, sqlx, or GORM
      /\b(?:db|tx|conn)\.(?:Query|QueryContext|QueryRow|QueryRowContext|Exec|ExecContext|Raw|Select|Get)\s*\((?:[^,]+,\s*)?["`]\s*(?:SELECT\s+[\s\S]*?\s+FROM|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[`"']?([a-zA-Z0-9_]+)[`"']?/gim,
    ],
    viewsAndResponses: [
      /\b(?:c\.HTML|c\.JSON|c\.IndentedJSON|c\.Render|ctx\.Status|ctx\.JSON|w\.Write|tmpl\.Execute|tmpl\.ExecuteTemplate)\s*\(/gm,
    ],
  },

  ts: {
    language: 'ts',
    entries: [
      // Express / Next.js / NestJS routes
      /\b(?:app|router)\.(get|post|put|delete|patch|options|all)\s*\(\s*['"]([^'"]+)['"]/gm,
      /@(Get|Post|Put|Delete|Patch|Options|Head|All)\s*\(\s*['"]([^'"]*)['"]\s*\)/gm,
    ],
    controllersAndLogic: [
      /class\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_]+))?(?:\s+implements\s+([A-Za-z0-9_,\s]+))?/gm,
      /(?:async\s+)?(?:public|protected|private|static)?\s*([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*(?::\s*[^;{]+)?\s*\{/gm,
    ],
    dependencyInjection: [
      // NestJS Constructor DI or @Inject
      /@Inject\s*\(\s*['"]?([A-Za-z0-9_]+)['"]?\s*\)/gm,
      /constructor\s*\(([\s\S]*?)\)/gm,
    ],
    modelsAndRelations: [
      // Prisma / TypeORM / Mongoose model declarations
      /@Entity\s*\(\s*(?:['"]([a-zA-Z0-9_]+)['"])?\s*\)/gm,
      /model\s+([A-Za-z0-9_]+)\s*\{/gm,
      /\b(?:OneToMany|ManyToOne|ManyToMany|OneToOne)\s*\(\s*\(?\)?\s*=>\s*([A-Za-z0-9_]+)/gm,
    ],
    dbSinksAndSchemas: [
      /\b(?:prisma|db|pool|client)\.([a-zA-Z0-9_]+)\.(?:findMany|findUnique|findFirst|create|update|delete|upsert)\s*\(/gm,
      /(?:query|\$queryRaw|\$queryRawUnsafe|raw)\s*\(\s*['"`]\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*?\s+FROM\s+[`"']?([a-zA-Z0-9_]+)[`"']?/gim,
    ],
    viewsAndResponses: [
      /\bres\.(?:render|json|send|sendFile)\s*\(/gm,
      /\bNextResponse\.json\s*\(/gm,
    ],
  },
};

/**
 * Universal Pluralizer & Snake-Caser:
 * Converts ModelName (e.g. OrderItem, UserProfile, Category) to snake_case plural table name
 * (e.g. order_items, user_profiles, categories).
 */
export function pluralizeSnakeCase(modelName: string): string {
  if (!modelName) return '';

  // 1. Convert PascalCase / camelCase to snake_case
  const snake = modelName
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();

  // 2. English pluralization rules
  if (snake.endsWith('y') && !/[aeiou]y$/.test(snake)) {
    return snake.slice(0, -1) + 'ies'; // category -> categories
  }
  if (snake.endsWith('s') || snake.endsWith('x') || snake.endsWith('z') || snake.endsWith('ch') || snake.endsWith('sh')) {
    return snake + 'es'; // bus -> buses, box -> boxes
  }
  return snake + 's'; // order_item -> order_items
}

/**
 * BraceDepthPrefixStack:
 * Tracks route group prefix scopes based on lexical brace depth '{' and '}'
 * to compute exact full paths like /api/v1/users for nested route groups in Laravel, Express, and Go.
 */
export class BraceDepthPrefixStack {
  private stack: Array<{ prefix: string; braceDepth: number }> = [];
  private currentDepth = 0;

  public onOpenBrace(): void {
    this.currentDepth++;
  }

  public onCloseBrace(): void {
    this.currentDepth--;
    // Pop any prefixes that ended at this brace depth
    while (this.stack.length > 0 && this.stack[this.stack.length - 1].braceDepth >= this.currentDepth) {
      this.stack.pop();
    }
  }

  public pushPrefix(prefix: string): void {
    const clean = prefix.replace(/^\/+|\/+$/g, '');
    this.stack.push({ prefix: clean, braceDepth: this.currentDepth });
  }

  public getCombinedPrefix(): string {
    if (this.stack.length === 0) return '';
    return '/' + this.stack.map(s => s.prefix).filter(Boolean).join('/');
  }

  public resolvePath(subPath: string): string {
    const combined = this.getCombinedPrefix();
    const cleanSub = subPath.replace(/^\/+/, '');
    if (!combined) return '/' + cleanSub;
    if (!cleanSub) return combined;
    return `${combined}/${cleanSub}`;
  }

  public getCurrentDepth(): number {
    return this.currentDepth;
  }

  public reset(): void {
    this.stack = [];
    this.currentDepth = 0;
  }
}
