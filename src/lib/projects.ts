"use client";

import demoAnalysis from "@/data/demo-analysis.json";
import demoTranscript from "@/data/demo-transcript.json";
import type { Analysis, Project, Transcript } from "./types";

export const DEMO_ID = "demo";

export const demoProject: Project = {
  id: DEMO_ID,
  name: "Apollo 11 to Now",
  createdAt: Date.UTC(2019, 6, 12),
  kind: "audio",
  transcript: demoTranscript as Transcript,
  analysis: demoAnalysis as Analysis,
  mediaUrl: "/demo/apollo-11-to-now.mp3",
  cover: "/demo/cover.jpg",
  source: {
    show: "Houston We Have a Podcast",
    episode: "Episode 100 · NASA Johnson Space Center",
    url: "https://www.nasa.gov/podcasts/houston-we-have-a-podcast/apollo-11-to-now/",
    credit: "Audio courtesy of NASA",
  },
};

const DB = "repurpose-studio";
const STORE = "projects";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const saveProject = (p: Project) => tx("readwrite", (s) => s.put(p));
export const deleteProject = (id: string) => tx("readwrite", (s) => s.delete(id));

export async function getProject(id: string): Promise<Project | null> {
  if (id === DEMO_ID) return demoProject;
  return (await tx<Project | undefined>("readonly", (s) => s.get(id))) ?? null;
}

export async function listProjects(): Promise<Project[]> {
  try {
    const all = await tx<Project[]>("readonly", (s) => s.getAll());
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}
