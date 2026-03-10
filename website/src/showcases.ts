/** Metadata for a showcased project. */
export interface ShowcaseProject {
  /** URL slug used in routes and file paths. */
  slug: string;
  /** Display name. */
  name: string;
  /** Short description of the project. */
  description: string;
  /** GitHub repository URL. */
  repo: string;
  /** Number of nodes in the graph (populated after generation). */
  nodes?: number;
  /** Number of edges in the graph (populated after generation). */
  edges?: number;
}

/** List of projects showcased on the website. */
export const showcases: ShowcaseProject[] = [
  {
    slug: 'tldraw',
    name: 'tldraw',
    description: 'A tiny little drawing app — a collaborative digital whiteboard.',
    repo: 'https://github.com/tldraw/tldraw',
  },
  {
    slug: 'treck',
    name: 'treck',
    description: 'Your codebase, visualised. Evergreen maps of every code flow.',
    repo: 'https://github.com/fredrivett/treck',
  },
  {
    slug: 'cal-com',
    name: 'Cal.com',
    description: 'The open source Calendly alternative — scheduling infrastructure for everyone.',
    repo: 'https://github.com/calcom/cal.com',
  },
];
