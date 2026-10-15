export type Category = "road_damage" | "garbage" | "waterlogging" | "manhole";
export type Status = "submitted" | "under_review" | "in_progress" | "resolved" | "rejected";
export interface User {
  id: string; name: string; email: string; role: string; jurisdiction_id: string;
}
export interface Auth {
  access_token: string; expires_at: string; token_type: string; user: User;
}
export interface Config {
  jurisdiction_id: string; jurisdiction_name: string;
  categories: {id: Category; label: string}[];
  analysis_state: "disabled"; notice: string;
}
export interface ComplaintInput {
  client_request_id: string; title: string; description: string; category: Category;
  latitude: number; longitude: number; location_text: string;
  location_source: "manual" | "device"; image_note?: string | null;
}
export interface Complaint extends Omit<ComplaintInput, "client_request_id"> {
  id: string; tracking_id: string; jurisdiction_id: string; status: Status;
  version: number; received_at: string; updated_at: string; analysis_state: "disabled";
}
export interface Evidence {
  id: string; media_type: string; size_bytes: number; uploaded_at: string;
}
export interface Detail extends Complaint {
  events: {id: string; status: Status; note: string; created_at: string}[];
  evidence: Evidence[];
}
export interface Page {items: Complaint[]; total: number; offset: number; limit: number}

export const labels: Record<Category, string> = {
  road_damage: "Potholes / visible road damage",
  garbage: "Garbage dumping / accumulation",
  waterlogging: "Road waterlogging",
  manhole: "Missing / broken manhole cover",
};
export const transitions: Record<Status, Status[]> = {
  submitted: ["under_review"],
  under_review: ["in_progress", "resolved", "rejected"],
  in_progress: ["under_review", "resolved"],
  resolved: ["under_review"],
  rejected: ["under_review"],
};
export const statusLabel = (status: string) => status.replaceAll("_", " ");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message); this.name = "ApiError"; this.status = status;
  }
}

export function createClient(baseUrl: string, token?: string) {
  const root = baseUrl.replace(/\/$/, "");
  async function timedFetch(url: string, options: RequestInit = {}) {
    // AbortController works in React Native too; AbortSignal.timeout is not assumed.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {return await fetch(url, {...options, signal: options.signal ?? controller.signal});}
    finally {clearTimeout(timer);}
  }
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
    let response: Response;
    try {
      response = await timedFetch(`${root}/api/v1${path}`, {
        ...options, headers,
      });
    } catch {
      throw new ApiError(0, "Cannot reach the server. Check the connection and retry.");
    }
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = await response.json();
        if (typeof body.detail === "string") message = body.detail;
        else if (Array.isArray(body.detail)) message = body.detail.map(
          (item: {loc: string[]; msg: string}) => `${item.loc.slice(1).join(".")}: ${item.msg}`,
        ).join("; ");
      } catch { /* No server details available. */ }
      throw new ApiError(response.status, message);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
  const json = (value: unknown) => JSON.stringify(value);
  return {
    config: () => request<Config>("/config"),
    register: (name: string, email: string, password: string) => request<User>("/auth/register", {
      method: "POST", body: json({name, email, password}),
    }),
    login: (email: string, password: string) => request<Auth>("/auth/login", {
      method: "POST", body: json({email, password}),
    }),
    me: () => request<User>("/auth/me"),
    logout: () => request<void>("/auth/logout", {method: "POST"}),
    list: (offset = 0, status?: Status) => request<Page>(
      `/complaints?offset=${offset}&limit=25${status ? `&status=${encodeURIComponent(status)}` : ""}`,
    ),
    get: (tracking: string) => request<Detail>(`/complaints/${encodeURIComponent(tracking)}`),
    submit: (data: ComplaintInput) => request<Detail>("/complaints", {method: "POST", body: json(data)}),
    update: (tracking: string, status: Status, note: string, version: number) => request<Detail>(
      `/complaints/${encodeURIComponent(tracking)}/status`, {
        method: "POST", body: json({status, note, expected_version: version}),
      },
    ),
    upload: (tracking: string, data: FormData) => request<Evidence>(
      `/complaints/${encodeURIComponent(tracking)}/evidence`, {method: "POST", body: data},
    ),
    async evidence(tracking: string, id: string): Promise<Blob> {
      const response = await timedFetch(`${root}/api/v1/complaints/${encodeURIComponent(tracking)}/evidence/${encodeURIComponent(id)}`, {
        headers: token ? {Authorization: `Bearer ${token}`} : {},
      });
      if (!response.ok) throw new ApiError(response.status, "Cannot load this photograph");
      return response.blob();
    },
    evidenceUrl: (tracking: string, id: string) => `${root}/api/v1/complaints/${encodeURIComponent(tracking)}/evidence/${encodeURIComponent(id)}`,
  };
}
export type Client = ReturnType<typeof createClient>;
