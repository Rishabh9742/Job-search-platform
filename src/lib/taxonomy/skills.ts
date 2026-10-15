/**
 * Canonical skill dictionary. Used for deterministic skill extraction from job
 * descriptions and resumes. Each entry: canonical name → aliases (lowercase).
 * Matching is word-boundary based to avoid "Go" matching "good".
 */
const SKILLS: Record<string, string[]> = {
  // Languages
  JavaScript: ["javascript", "js", "es6", "ecmascript"],
  TypeScript: ["typescript", "ts"],
  Python: ["python"],
  Java: ["java"],
  Kotlin: ["kotlin"],
  Swift: ["swift"],
  "Objective-C": ["objective-c", "objective c"],
  "C#": ["c#", "csharp", "c sharp"],
  "C++": ["c++", "cpp"],
  C: ["c programming", "ansi c"],
  Go: ["golang", "go lang", "go"],
  Rust: ["rust"],
  Ruby: ["ruby"],
  PHP: ["php"],
  Scala: ["scala"],
  R: ["r programming", "r language", "rstudio"],
  Dart: ["dart"],
  Elixir: ["elixir"],
  Lua: ["lua"],
  SQL: ["sql"],
  Bash: ["bash", "shell scripting", "shell script"],
  PowerShell: ["powershell"],
  MATLAB: ["matlab"],
  Solidity: ["solidity"],
  // Frontend
  React: ["react", "react.js", "reactjs"],
  "React Native": ["react native", "react-native"],
  "Next.js": ["next.js", "nextjs"],
  Redux: ["redux"],
  Vue: ["vue", "vue.js", "vuejs"],
  Nuxt: ["nuxt", "nuxt.js"],
  Angular: ["angular", "angularjs"],
  Svelte: ["svelte", "sveltekit"],
  HTML: ["html", "html5"],
  CSS: ["css", "css3"],
  Sass: ["sass", "scss"],
  "Tailwind CSS": ["tailwind", "tailwindcss", "tailwind css"],
  Bootstrap: ["bootstrap"],
  jQuery: ["jquery"],
  Webpack: ["webpack"],
  Vite: ["vite"],
  "Web Accessibility": ["accessibility", "wcag", "a11y"],
  GraphQL: ["graphql"],
  "REST APIs": ["rest api", "rest apis", "restful", "rest"],
  gRPC: ["grpc"],
  WebSockets: ["websocket", "websockets"],
  // Backend
  "Node.js": ["node.js", "nodejs", "node"],
  Express: ["express", "express.js", "expressjs"],
  NestJS: ["nestjs", "nest.js"],
  Django: ["django"],
  Flask: ["flask"],
  FastAPI: ["fastapi"],
  Spring: ["spring", "spring boot", "springboot"],
  ".NET": [".net", "dotnet", "asp.net", ".net core"],
  "Ruby on Rails": ["rails", "ruby on rails"],
  Laravel: ["laravel"],
  Microservices: ["microservices", "microservice"],
  Kafka: ["kafka"],
  RabbitMQ: ["rabbitmq"],
  // Data stores
  PostgreSQL: ["postgresql", "postgres"],
  MySQL: ["mysql"],
  MongoDB: ["mongodb", "mongo"],
  Redis: ["redis"],
  Elasticsearch: ["elasticsearch", "elastic search", "opensearch"],
  DynamoDB: ["dynamodb"],
  Cassandra: ["cassandra"],
  SQLite: ["sqlite"],
  "SQL Server": ["sql server", "mssql"],
  Oracle: ["oracle db", "oracle database", "pl/sql"],
  Snowflake: ["snowflake"],
  BigQuery: ["bigquery"],
  Redshift: ["redshift"],
  Prisma: ["prisma"],
  // Cloud & DevOps
  AWS: ["aws", "amazon web services"],
  Azure: ["azure", "microsoft azure"],
  GCP: ["gcp", "google cloud", "google cloud platform"],
  Docker: ["docker", "containers", "containerization"],
  Kubernetes: ["kubernetes", "k8s", "eks", "gke", "aks"],
  Terraform: ["terraform"],
  Ansible: ["ansible"],
  "CI/CD": ["ci/cd", "continuous integration", "continuous delivery", "continuous deployment"],
  Jenkins: ["jenkins"],
  "GitHub Actions": ["github actions"],
  GitLab: ["gitlab", "gitlab ci"],
  Linux: ["linux", "unix"],
  Nginx: ["nginx"],
  Prometheus: ["prometheus"],
  Grafana: ["grafana"],
  Datadog: ["datadog"],
  Serverless: ["serverless", "lambda", "aws lambda", "cloud functions"],
  Helm: ["helm"],
  "Site Reliability": ["sre", "site reliability"],
  Networking: ["tcp/ip", "networking", "dns"],
  Git: ["git"],
  // Data & ML
  Pandas: ["pandas"],
  NumPy: ["numpy"],
  "scikit-learn": ["scikit-learn", "sklearn", "scikit learn"],
  TensorFlow: ["tensorflow"],
  PyTorch: ["pytorch"],
  Keras: ["keras"],
  "Machine Learning": ["machine learning", "ml"],
  "Deep Learning": ["deep learning"],
  NLP: ["nlp", "natural language processing"],
  "Computer Vision": ["computer vision", "opencv"],
  LLMs: ["llm", "llms", "large language models", "generative ai", "genai"],
  "Prompt Engineering": ["prompt engineering"],
  RAG: ["rag", "retrieval augmented generation", "retrieval-augmented generation"],
  LangChain: ["langchain"],
  "Hugging Face": ["hugging face", "huggingface", "transformers"],
  MLOps: ["mlops"],
  Spark: ["spark", "pyspark", "apache spark"],
  Hadoop: ["hadoop"],
  Airflow: ["airflow"],
  dbt: ["dbt"],
  ETL: ["etl", "elt", "data pipelines", "data pipeline"],
  "Data Warehousing": ["data warehouse", "data warehousing"],
  "Data Modeling": ["data modeling", "data modelling"],
  Statistics: ["statistics", "statistical analysis", "hypothesis testing"],
  "A/B Testing": ["a/b testing", "ab testing", "experimentation"],
  Excel: ["excel", "microsoft excel", "spreadsheets"],
  Tableau: ["tableau"],
  "Power BI": ["power bi", "powerbi"],
  Looker: ["looker"],
  "Data Visualization": ["data visualization", "data visualisation", "dashboards"],
  "Google Analytics": ["google analytics", "ga4"],
  // Mobile & games
  Android: ["android"],
  iOS: ["ios"],
  Flutter: ["flutter"],
  SwiftUI: ["swiftui"],
  "Jetpack Compose": ["jetpack compose"],
  Unity: ["unity", "unity3d"],
  "Unreal Engine": ["unreal", "unreal engine"],
  Godot: ["godot"],
  // QA
  Selenium: ["selenium"],
  Cypress: ["cypress"],
  Playwright: ["playwright"],
  Jest: ["jest"],
  Vitest: ["vitest"],
  JUnit: ["junit"],
  PyTest: ["pytest"],
  "Test Automation": ["test automation", "automated testing", "automation testing"],
  "Manual Testing": ["manual testing"],
  Appium: ["appium"],
  Postman: ["postman"],
  JMeter: ["jmeter"],
  // Design
  Figma: ["figma"],
  Sketch: ["sketch"],
  "Adobe XD": ["adobe xd"],
  Photoshop: ["photoshop"],
  Illustrator: ["illustrator"],
  Prototyping: ["prototyping", "wireframing", "wireframes"],
  "User Research": ["user research", "usability testing"],
  "Design Systems": ["design system", "design systems"],
  // Business / product
  "Requirements Gathering": ["requirements gathering", "requirements analysis", "business requirements"],
  "Process Modeling": ["bpmn", "process modeling", "process mapping"],
  Jira: ["jira"],
  Confluence: ["confluence"],
  Agile: ["agile", "scrum", "kanban"],
  "Stakeholder Management": ["stakeholder management", "stakeholders"],
  "Product Analytics": ["product analytics", "mixpanel", "amplitude"],
  Salesforce: ["salesforce"],
  SAP: ["sap"],
  "Project Management": ["project management"],
  // Support
  "Technical Support": ["technical support", "tech support", "troubleshooting"],
  Zendesk: ["zendesk"],
  ITIL: ["itil"],
  "Customer Service": ["customer service", "customer support"],
  // Security
  Security: ["cybersecurity", "application security", "appsec", "owasp"],
  OAuth: ["oauth", "oauth2", "openid connect", "oidc"],
};

const MAX_ALIAS_WORDS = 4;

type Entry = { canonical: string; alias: string };
const ENTRIES: Entry[] = Object.entries(SKILLS).flatMap(([canonical, aliases]) =>
  [canonical.toLowerCase(), ...aliases].map((alias) => ({ canonical, alias })),
);

/** Aliases that are ordinary English words and need stronger context to count. */
const AMBIGUOUS = new Set(["go", "rest", "node", "spark", "swift", "unity", "express", "sketch", "dart", "rust", "r", "c", "ml", "spring", "ts", "js", "sap", "helm"]);

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PATTERNS = ENTRIES.filter((e) => e.alias.split(" ").length <= MAX_ALIAS_WORDS).map((e) => ({
  ...e,
  re: new RegExp(`(?<![a-z0-9+#.])${escapeRe(e.alias)}(?![a-z0-9+#])`, AMBIGUOUS.has(e.alias) ? "" : "i"),
}));

/**
 * Extract canonical skills from free text. Ambiguous aliases (e.g. "Go") are
 * matched case-sensitively in their canonical capitalization only.
 */
export function extractSkills(text: string): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const p of PATTERNS) {
    if (AMBIGUOUS.has(p.alias)) {
      const cased = new RegExp(`(?<![A-Za-z0-9+#.])${escapeRe(p.canonical)}(?![A-Za-z0-9+#])`);
      if (p.alias === "go" ? /\b(Go|Golang)\b(?! to| ahead| live| beyond| further)/.test(text) : cased.test(text)) found.add(p.canonical);
      continue;
    }
    if (p.re.test(lower)) found.add(p.canonical);
  }
  // A JS framework mention implies the language only if the language itself also appears; do not infer.
  return [...found].sort();
}

/** Normalize a user-supplied skill name to its canonical form if known. */
export function canonicalSkill(name: string): string {
  const n = name.trim().toLowerCase();
  const hit = ENTRIES.find((e) => e.alias === n);
  return hit ? hit.canonical : name.trim();
}

export function sameSkill(a: string, b: string) {
  return canonicalSkill(a).toLowerCase() === canonicalSkill(b).toLowerCase();
}

export const ALL_SKILLS = Object.keys(SKILLS);
