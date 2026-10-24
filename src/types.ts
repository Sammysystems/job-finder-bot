export interface Job {
  id: string;
  title: string;
  company?: string;
  location?: string;
  url: string;
  description?: string;
  postedAt?: string;
  source: string;
  remote?: boolean;
  salary?: string;
  /** Where the role can be done from; see eligibility.ts. */
  eligibility?: string;
  /** Contact address when the posting itself lists one (common on HN). */
  email?: string;
  /** Source thread for signal feeds such as HN "Who is hiring?". */
  threadId?: string;
}

export interface StoredJob extends Job {
  seenAt: string;
  notifiedAt?: string;
}

export interface PipelineSummary {
  fetched: number;
  matched: number;
  newJobs: number;
  notified: number;
}
