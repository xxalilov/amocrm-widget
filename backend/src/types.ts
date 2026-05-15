export interface AmoEntity {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  updated_at: number;
  custom_fields_values?: Array<{
    field_id?: number;
    field_code?: string;
    field_name?: string;
    values: Array<{ value: string }>;
  }>;
}

export interface SearchResult {
  _embedded?: {
    contacts?: AmoEntity[];
    leads?: AmoEntity[];
  };
}