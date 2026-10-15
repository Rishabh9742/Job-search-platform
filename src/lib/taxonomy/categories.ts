export interface JobCategory {
  id: string;
  label: string;
  /** Regexes matched (case-insensitive) against job titles. */
  titlePatterns: RegExp[];
  /** Search terms used when querying providers that accept keywords. */
  searchTerms: string[];
  coreSkills: string[];
}

export const CATEGORIES: JobCategory[] = [
  {
    id: "frontend",
    label: "Front-End Developer",
    titlePatterns: [/front[\s-]?end/i, /\bui (developer|engineer)\b/i, /\bjavascript (developer|engineer)\b/i],
    searchTerms: ["frontend developer", "front end engineer"],
    coreSkills: ["JavaScript", "TypeScript", "React", "HTML", "CSS"],
  },
  {
    id: "react",
    label: "React Developer",
    titlePatterns: [/\breact\b(?! native)/i],
    searchTerms: ["react developer"],
    coreSkills: ["React", "JavaScript", "TypeScript", "Redux", "Next.js"],
  },
  {
    id: "backend",
    label: "Back-End Developer",
    titlePatterns: [/back[\s-]?end/i, /\b(api|server[\s-]side) (developer|engineer)\b/i, /\b(node(\.js)?|java|python|golang|go|ruby|php|\.net|django) (developer|engineer)\b/i],
    searchTerms: ["backend developer", "backend engineer"],
    coreSkills: ["Node.js", "Python", "Java", "SQL", "REST APIs"],
  },
  {
    id: "fullstack",
    label: "Full-Stack Developer",
    titlePatterns: [/full[\s-]?stack/i],
    searchTerms: ["full stack developer"],
    coreSkills: ["JavaScript", "TypeScript", "React", "Node.js", "SQL"],
  },
  {
    id: "software",
    label: "Software Engineer",
    titlePatterns: [/\bsoftware (engineer|developer)\b/i, /\bsde\b/i, /\bprogrammer\b/i, /\bapplication (developer|engineer)\b/i],
    searchTerms: ["software engineer"],
    coreSkills: ["Git", "SQL", "REST APIs"],
  },
  {
    id: "web",
    label: "Web Developer",
    titlePatterns: [/\bweb (developer|engineer|programmer)\b/i, /\bwordpress\b/i],
    searchTerms: ["web developer"],
    coreSkills: ["HTML", "CSS", "JavaScript", "PHP"],
  },
  {
    id: "mobile",
    label: "Mobile App Developer",
    titlePatterns: [/\b(mobile|ios|android|flutter|react native)\b.*\b(developer|engineer)\b/i],
    searchTerms: ["mobile developer", "ios developer", "android developer"],
    coreSkills: ["iOS", "Android", "Swift", "Kotlin", "React Native", "Flutter"],
  },
  {
    id: "game",
    label: "Game Developer",
    titlePatterns: [/\bgame(play)? (developer|engineer|programmer)\b/i, /\b(unity|unreal) (developer|engineer)\b/i],
    searchTerms: ["game developer"],
    coreSkills: ["Unity", "Unreal Engine", "C++", "C#"],
  },
  {
    id: "data-analyst",
    label: "Data Analyst",
    titlePatterns: [/\bdata analyst\b/i, /\b(bi|business intelligence|reporting|analytics) (analyst|developer)\b/i],
    searchTerms: ["data analyst"],
    coreSkills: ["SQL", "Excel", "Tableau", "Power BI", "Python", "Statistics"],
  },
  {
    id: "business-analyst",
    label: "Business Analyst",
    titlePatterns: [/\bbusiness (systems )?analyst\b/i, /\bfunctional analyst\b/i],
    searchTerms: ["business analyst"],
    coreSkills: ["Requirements Gathering", "SQL", "Excel", "Jira", "Stakeholder Management", "Process Modeling"],
  },
  {
    id: "data-engineer",
    label: "Data Engineer",
    titlePatterns: [/\bdata engineer/i, /\b(etl|analytics) engineer\b/i, /\bdata platform engineer\b/i],
    searchTerms: ["data engineer"],
    coreSkills: ["SQL", "Python", "Spark", "Airflow", "ETL", "dbt"],
  },
  {
    id: "ai-engineer",
    label: "AI Engineer",
    titlePatterns: [/\b(ai|llm|genai|generative ai) (engineer|developer)\b/i, /\bapplied ai\b/i],
    searchTerms: ["ai engineer", "llm engineer"],
    coreSkills: ["Python", "LLMs", "RAG", "Prompt Engineering", "PyTorch"],
  },
  {
    id: "ml-engineer",
    label: "Machine Learning Engineer",
    titlePatterns: [/\bmachine learning\b/i, /\bml (engineer|scientist)\b/i, /\bmlops\b/i, /\bdata scientist\b/i],
    searchTerms: ["machine learning engineer"],
    coreSkills: ["Python", "Machine Learning", "PyTorch", "TensorFlow", "scikit-learn"],
  },
  {
    id: "cloud",
    label: "Cloud Engineer",
    titlePatterns: [/\bcloud (engineer|architect|developer)\b/i, /\b(aws|azure|gcp) (engineer|architect)\b/i],
    searchTerms: ["cloud engineer"],
    coreSkills: ["AWS", "Azure", "GCP", "Terraform", "Kubernetes"],
  },
  {
    id: "devops",
    label: "DevOps Engineer",
    titlePatterns: [/\bdevops\b/i, /\b(site reliability|sre|platform|infrastructure) engineer\b/i],
    searchTerms: ["devops engineer", "site reliability engineer"],
    coreSkills: ["Docker", "Kubernetes", "CI/CD", "Terraform", "Linux", "AWS"],
  },
  {
    id: "qa",
    label: "QA Engineer",
    titlePatterns: [/\b(qa|quality assurance|test|testing|sdet|automation test)\b.*\b(engineer|analyst|tester|lead)\b/i, /\bsdet\b/i],
    searchTerms: ["qa engineer", "test automation engineer"],
    coreSkills: ["Test Automation", "Selenium", "Cypress", "Playwright", "Manual Testing"],
  },
  {
    id: "uiux",
    label: "UI/UX Designer",
    titlePatterns: [/\b(ui|ux|ui\/ux|product|interaction|visual) designer\b/i, /\bux researcher\b/i],
    searchTerms: ["ux designer", "product designer"],
    coreSkills: ["Figma", "Prototyping", "User Research", "Design Systems"],
  },
  {
    id: "product-analyst",
    label: "Product Analyst",
    titlePatterns: [/\bproduct analyst\b/i, /\bgrowth analyst\b/i],
    searchTerms: ["product analyst"],
    coreSkills: ["SQL", "Product Analytics", "A/B Testing", "Excel", "Statistics"],
  },
  {
    id: "tech-support",
    label: "Technical Support Engineer",
    titlePatterns: [/\b(technical|tech|it|application|customer) support\b/i, /\bsupport engineer\b/i, /\bhelp ?desk\b/i],
    searchTerms: ["technical support engineer"],
    coreSkills: ["Technical Support", "Linux", "SQL", "Networking", "Zendesk"],
  },
];

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);

/** Build a matcher for a user-defined role title ("Salesforce Developer"). */
export function customRoleCategory(role: string): JobCategory {
  const words = role
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length > 1);
  const pattern = new RegExp(words.map((w) => `(?=.*\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b)`).join(""), "i");
  return { id: `custom:${role}`, label: role, titlePatterns: [pattern], searchTerms: [role], coreSkills: [] };
}

/** Return every category whose title patterns match the job title. */
export function categoriesForTitle(title: string, extra: JobCategory[] = []): string[] {
  return [...CATEGORIES, ...extra].filter((c) => c.titlePatterns.some((p) => p.test(title))).map((c) => c.id);
}

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "GRADUATE"] as const;
export const EXPERIENCE_LEVELS = ["ENTRY", "JUNIOR", "MID", "SENIOR", "LEAD"] as const;
export const WORK_ARRANGEMENTS = ["REMOTE", "HYBRID", "ONSITE"] as const;

export function normalizeEmploymentType(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/intern/.test(s)) return "INTERNSHIP";
  if (/graduate|new grad|trainee/.test(s)) return "GRADUATE";
  if (/contract|freelance|temporary|temp\b|fixed[- ]term|contractor/.test(s)) return "CONTRACT";
  if (/part[\s_-]?time/.test(s)) return "PART_TIME";
  if (/full[\s_-]?time|permanent|regular/.test(s)) return "FULL_TIME";
  return null;
}

/** Seniority from title first, then explicit year requirements. Returns null when unclear. */
export function inferExperienceLevel(title: string, description = ""): string | null {
  const t = title.toLowerCase();
  if (/\b(intern|internship)\b/.test(t)) return "ENTRY";
  if (/\b(principal|staff|lead|head|director|architect|manager)\b/.test(t)) return "LEAD";
  if (/\b(senior|sr\.?|iii|iv)\b/.test(t)) return "SENIOR";
  if (/\b(junior|jr\.?|associate|graduate|entry)\b/.test(t)) return "JUNIOR";
  if (/\b(mid|intermediate|ii)\b/.test(t)) return "MID";
  const years = requiredYears(description);
  if (years == null) return null;
  if (years <= 1) return "ENTRY";
  if (years <= 2) return "JUNIOR";
  if (years <= 5) return "MID";
  return "SENIOR";
}

/** Minimum years of experience explicitly stated, e.g. "3+ years of experience". */
export function requiredYears(description: string): number | null {
  const m = description.match(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)(?:'|’)?\s+(?:of\s+)?(?:professional\s+|relevant\s+|industry\s+|hands-on\s+|work\s+)?experience/i);
  return m ? Number(m[1]) : null;
}
