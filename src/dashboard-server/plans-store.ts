import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface TestCase {
  id: string;
  title: string;
  description: string;
  steps: string[];
  url: string;
  category: string;
}

export interface TestPlan {
  id: string;
  projectName: string;
  projectRoot: string;
  baseUrl: string;
  techStack: string[];
  testCases: TestCase[];
  createdAt: string;
  specsDir: string;
}

export const DEFAULT_PLANS_FILE = path.join(os.homedir(), '.qacito', 'plans.jsonl');

const planMap = new Map<string, TestPlan>();

export async function savePlan(plan: TestPlan, plansFilePath = DEFAULT_PLANS_FILE): Promise<void> {
  planMap.set(plan.id, plan);
  await fs.mkdir(path.dirname(plansFilePath), { recursive: true });
  await fs.appendFile(plansFilePath, JSON.stringify(plan) + '\n', 'utf-8');
}

export function getPlanById(id: string): TestPlan | undefined {
  return planMap.get(id);
}

export function getLatestPlanForProject(projectRoot: string): TestPlan | undefined {
  return [...planMap.values()]
    .filter((p) => p.projectRoot === projectRoot)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function listPlans(): TestPlan[] {
  return [...planMap.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadPlansFromDisk(plansFilePath = DEFAULT_PLANS_FILE): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(plansFilePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  for (const line of raw.split('\n').filter((l) => l.trim() !== '')) {
    try {
      const plan = JSON.parse(line) as TestPlan;
      planMap.set(plan.id, plan);
    } catch {
      // skip malformed lines
    }
  }
}
