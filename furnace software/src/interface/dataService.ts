export interface DataService {
  get<T>(path: string, options?: RequestInit): Promise<T>;
  post<T>(path: string, data: unknown, options?: RequestInit): Promise<T>;
  postForm<T>(path: string, form: FormData, options?: RequestInit): Promise<T>;
  put<T>(path: string, data: unknown, options?: RequestInit): Promise<T>;
  patch<T>(path: string, data: unknown, options?: RequestInit): Promise<T>;
  patchForm<T>(path: string, form: FormData, options?: RequestInit): Promise<T>;
  delete<T = void>(path: string, options?: RequestInit): Promise<T>;
}
