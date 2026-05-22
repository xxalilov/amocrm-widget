export interface Account {
    id: string;
    name: string;
    subdomain: string;
    access_token: string;
    refresh_token: string;
    expires_at?: number;
}