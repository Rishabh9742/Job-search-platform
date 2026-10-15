import { isMockMode } from "@/lib/env";
import { buildJob } from "../normalize";
import type { JobProvider } from "../types";

/**
 * Development-only source. Every job is flagged isMock, prefixed "[MOCK]",
 * and routed to the sandbox ATS — never to a real employer.
 */
export const mockProvider: JobProvider = {
  key: "mock",
  name: "Mock data (development)",
  coverage: "Synthetic listings for offline development. Clearly labelled MOCK in the UI.",
  credentialsRequired: ["MOCK_MODE=true"],
  termsNote: "Not real vacancies.",
  defaultEnabled: true,
  minIntervalMinutes: 1,
  isMock: true,
  isConfigured: () => isMockMode(),
  async fetchJobs() {
    const roles = [
      { title: "Frontend Engineer (React)", skills: "React, TypeScript, CSS, Jest, accessibility (WCAG)", loc: "Remote (Worldwide)" },
      { title: "Business Analyst", skills: "requirements gathering, SQL, Jira, stakeholder management, BPMN", loc: "London, United Kingdom" },
      { title: "Data Engineer", skills: "Python, SQL, Airflow, dbt, Snowflake", loc: "Bengaluru, India" },
    ];
    return roles.map((r, i) =>
      buildJob({
        sourceKey: "mock",
        externalId: `mock-${i}`,
        title: `[MOCK] ${r.title}`,
        company: "MOCK Example Co",
        descriptionText: `THIS IS MOCK DATA FOR DEVELOPMENT.\n\nRequirements:\n• 2+ years of experience\n• ${r.skills}\n\nNice to have: Docker, AWS.`,
        locationText: r.loc,
        postedAt: new Date(),
        jobUrl: `https://example.com/mock-jobs/${i}`,
        applyUrl: `https://example.com/mock-jobs/${i}/apply`,
        applicationMethod: "GREENHOUSE",
        atsBoardToken: "mock-board",
        atsJobId: String(1000 + i),
        isMock: true,
      }),
    );
  },
};
