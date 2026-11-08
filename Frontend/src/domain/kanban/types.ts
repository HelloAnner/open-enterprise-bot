export interface JobOpportunity {
  id: string;
  company: string;
  title: string;
  meta: string;
}

export interface BoardColumn {
  id: string;
  title: string;
  jobs: JobOpportunity[];
}
