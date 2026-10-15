import type { CandidateProfile } from "@/lib/profile/schema";
import type { MatchJob, MatchPreferences } from "@/lib/matching/match";

export const RESUME_TEXT = `Priya Sharma
Bengaluru, India | priya.sharma@example.com | +91 98765 43210
linkedin.com/in/priyasharma | github.com/priyasharma

SUMMARY
Frontend engineer building accessible React applications.

EXPERIENCE
Frontend Engineer | Acme Fintech
Jan 2021 - Present
• Built a React and TypeScript design system used by 6 product teams
• Reduced bundle size by 40% with code splitting and Vite
Junior Web Developer, Bright Agency
Jun 2019 - Dec 2020
• Developed responsive websites with HTML, CSS and JavaScript

EDUCATION
B.Tech in Computer Science
Visvesvaraya Technological University
2015 - 2019

SKILLS
React, TypeScript, JavaScript, HTML, CSS, Redux, Jest, Git, Figma

PROJECTS
Budget Tracker | React, Node.js
• Personal finance app with charts and CSV import

CERTIFICATIONS
AWS Certified Cloud Practitioner
`;

export function profile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    fullName: "Priya Sharma",
    email: "priya.sharma@example.com",
    phone: "+91 98765 43210",
    location: "Bengaluru, India",
    countryCode: "IN",
    headline: "Frontend Engineer",
    summary: "Frontend engineer building accessible React applications.",
    links: [{ label: "LinkedIn", url: "https://linkedin.com/in/priyasharma" }],
    skills: ["React", "TypeScript", "JavaScript", "HTML", "CSS", "Redux", "Jest", "Git", "Figma"],
    experience: [
      { title: "Frontend Engineer", company: "Acme Fintech", startDate: "Jan 2021", endDate: "Present", current: true, location: null, bullets: ["Built a React and TypeScript design system used by 6 product teams", "Reduced bundle size by 40% with code splitting and Vite"] },
      { title: "Junior Web Developer", company: "Bright Agency", startDate: "Jun 2019", endDate: "Dec 2020", current: false, location: null, bullets: ["Developed responsive websites with HTML, CSS and JavaScript"] },
    ],
    education: [{ institution: "Visvesvaraya Technological University", degree: "B.Tech", field: "Computer Science", startDate: "2015", endDate: "2019", grade: null }],
    projects: [{ name: "Budget Tracker", description: null, technologies: ["React", "Node.js"], url: null, bullets: ["Personal finance app with charts and CSV import"] }],
    certifications: [{ name: "AWS Certified Cloud Practitioner", issuer: null, date: null }],
    achievements: [],
    languages: ["English", "Hindi"],
    yearsExperience: 5,
    workAuthorizations: [
      { countryCode: "IN", authorized: true, requiresSponsorship: false },
      { countryCode: "GB", authorized: false, requiresSponsorship: true },
    ],
    salaryExpectation: "Negotiable",
    availability: "30 days notice",
    answerBank: [],
    verified: true,
    uncertainFields: [],
    ...overrides,
  };
}

export function prefs(overrides: Partial<MatchPreferences> = {}): MatchPreferences {
  return {
    categories: ["frontend", "react"],
    customRoles: [],
    keywords: [],
    excludedKeywords: [],
    countries: ["IN", "GB"],
    includeWorldwideRemote: true,
    workArrangements: ["REMOTE", "HYBRID", "ONSITE"],
    employmentTypes: ["FULL_TIME"],
    experienceLevels: [],
    salaryMin: null,
    salaryCurrency: null,
    minMatchScore: 50,
    excludedCompanies: [],
    excludedIndustries: [],
    maxPostingAgeDays: 30,
    ...overrides,
  };
}

export function job(overrides: Partial<MatchJob> = {}): MatchJob {
  return {
    title: "Senior React Developer",
    company: "Globex",
    description: "About the role\nYou will build our web app.\n\nRequirements\n• 4+ years of experience\n• React, TypeScript, Redux\n• Testing with Jest\n\nNice to have\n• GraphQL\n• Next.js",
    countries: ["IN"],
    remoteRegions: [],
    isRemote: false,
    workArrangement: "HYBRID",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    employmentType: "FULL_TIME",
    experienceLevel: "SENIOR",
    tags: [],
    postedAt: new Date(),
    status: "ACTIVE",
    sourceKey: "greenhouse",
    isMock: false,
    ...overrides,
  };
}
